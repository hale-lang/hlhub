// JS shim backing the Hale module's tsa_* imports with web-tree-sitter.
//
// Why this exists: `hale build --target wasm32` does not (yet) compile a
// package's [ffi] csrc (heron's glue.c + parser.c) for wasm — the tsa_*
// symbols come out of the build as unresolved `env` imports
// (hale-lang/hale#213). Until the toolchain closes that gap, we satisfy
// them here with web-tree-sitter, mirroring glue.c's contracts exactly.
// All plugin logic stays in Hale; this file is only a parser back-end.
//
// Marshalling notes:
// - @ffi("c") Int is i64 → handles cross as BigInt.
// - String params arrive as (pointer, length) into Hale linear memory.
// - String RETURNS must point into Hale memory. Growing memory from JS
//   is unsafe (Hale's bump allocator tracks its own break and would
//   later hand out our pages), so returns are written into the
//   runtime's static 64KB inbox slot — a fixed buffer malloc never
//   touches. Hale copies the string into its arena at the call
//   boundary, so the slot is free again immediately after.
// - Offsets in query rows are web-tree-sitter's UTF-16 string indices;
//   Hale passes them through untouched and the DOM consumes them
//   directly, so no byte↔UTF-16 conversion exists anywhere.
import { Parser, Language, Query } from 'web-tree-sitter';

const INBOX_CAP = 64 * 1024;

export async function createTsaGlue(locate) {
  await Parser.init({ locateFile: (f) => locate(f) });
  const language = await Language.load(locate('tree-sitter-hale.wasm'));

  const handles = new Map();
  let nextHandle = 1n;
  const put = (obj) => { const h = nextHandle++; handles.set(h, obj); return h; };
  const get = (h) => handles.get(h);
  const drop = (h) => { handles.delete(h); };

  // Wired via attach() once the Hale instance exists.
  let mem = null;
  let inboxPtr = 0;

  const u8 = () => new Uint8Array(mem.buffer);
  const readStr = (ptr, len) =>
    new TextDecoder().decode(u8().subarray(Number(ptr), Number(ptr) + Number(len)));

  const retStr = (s) => {
    let bytes = new TextEncoder().encode(s);
    if (bytes.length + 1 > INBOX_CAP) {
      // Truncate at a row boundary: worst case a giant file loses its
      // tail captures rather than corrupting the protocol.
      let cut = INBOX_CAP - 1;
      while (cut > 0 && bytes[cut - 1] !== 0x0a) cut--;
      bytes = bytes.subarray(0, cut);
    }
    u8().set(bytes, inboxPtr);
    u8()[inboxPtr + bytes.length] = 0;
    return inboxPtr;
  };

  const imports = {
    tsa_parser_new: () => {
      const p = new Parser();
      p.setLanguage(language);
      return put(p);
    },
    tsa_parser_delete: (h) => { get(h)?.delete(); drop(h); },
    tsa_parser_parse: (ph, srcPtr, len) => {
      const parser = get(ph);
      if (!parser) return 0n;
      const tree = parser.parse(readStr(srcPtr, len));
      return tree ? put(tree) : 0n;
    },
    tsa_tree_delete: (h) => { get(h)?.delete(); drop(h); },
    tsa_tree_root: (h) => {
      const tree = get(h);
      return tree ? put(tree.rootNode) : 0n;
    },
    tsa_node_delete: (h) => { drop(h); }, // JS nodes have no native handle to free
    tsa_query_new: (srcPtr, len) => {
      try {
        return put(new Query(language, readStr(srcPtr, len)));
      } catch {
        return 0n; // malformed .scm — Hale sees handle 0, is_valid() false
      }
    },
    tsa_query_delete: (h) => { get(h)?.delete(); drop(h); },
    tsa_query_apply: (qh, nh) => {
      const query = get(qh);
      const node = get(nh);
      if (!query || !node) return retStr('');
      const rows = query
        .captures(node)
        .map((c) => `${c.node.startIndex}:${c.node.endIndex}:${c.name}`)
        .join('\n');
      return retStr(rows ? rows + '\n' : '');
    },
  };

  return {
    imports,
    attach(memory, inboxDataPtr) {
      mem = memory;
      inboxPtr = inboxDataPtr;
    },
  };
}
