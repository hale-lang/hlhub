// Bridge to the Hale-built highlighter module (hale/main.wasm).
//
// Replaces the generated hale/main.mjs loader inside the extension: that
// loader resolves its wasm via import.meta.url, which doesn't survive
// esbuild bundling into a MV3 service worker. Loader semantics mirrored
// from main.mjs: stub every env import, call _hale_start once.
//
// Protocol with the Hale module (see hale/main.hl):
//   inbox <- highlights.scm, call set_query()   (once)
//   inbox <- source text,    call highlight()   (per block)
//   spans return through the hlhub_emit import as "start:end:cls" rows.
import { createTsaGlue } from './tsa-glue.js';

const INBOX_CAP = 64 * 1024;

export async function createHaleHighlighter({ wasmBytes, queryText, locate }) {
  const tsa = await createTsaGlue(locate);

  let emitted = '';
  let readEmit = () => '';

  const mod = await WebAssembly.compile(wasmBytes);
  const env = {};
  for (const im of WebAssembly.Module.imports(mod)) {
    if (im.kind !== 'function') continue;
    env[im.name] =
      tsa.imports[im.name] ??
      (im.name === 'hlhub_emit' ? (ptr) => { emitted = readEmit(ptr); } : () => 0);
  }
  const instance = await WebAssembly.instantiate(mod, { env });
  const { exports } = instance;

  readEmit = (ptr) => {
    const m = new Uint8Array(exports.memory.buffer);
    let end = ptr >>> 0;
    while (m[end]) end++;
    return new TextDecoder().decode(m.subarray(ptr >>> 0, end));
  };

  if (exports._hale_start) exports._hale_start();
  tsa.attach(exports.memory, exports.lotus_wasm_alloc(0));

  function send(text, method) {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > INBOX_CAP) return false;
    const ptr = exports.lotus_wasm_alloc(bytes.length);
    new Uint8Array(exports.memory.buffer).set(bytes, ptr);
    exports.lotus_wasm_set_inbox(bytes.length);
    exports[method]();
    return true;
  }

  send(queryText, 'set_query');

  // Returns non-overlapping {start, end, cls} spans over UTF-16 string
  // indices, sorted by start; innermost capture wins where they nest.
  function highlight(text) {
    emitted = '';
    if (!send(text, 'highlight')) return []; // oversized block: leave unstyled

    const spans = [];
    for (const row of emitted.split('\n')) {
      if (!row) continue;
      const c1 = row.indexOf(':');
      const c2 = row.indexOf(':', c1 + 1);
      if (c1 < 0 || c2 < 0) continue;
      spans.push({
        start: Number(row.slice(0, c1)),
        end: Number(row.slice(c1 + 1, c2)),
        cls: row.slice(c2 + 1),
      });
    }

    // Paint widest-first so nested (narrower) captures overwrite.
    const painted = new Array(text.length).fill(null);
    spans.sort((a, b) => (b.end - b.start) - (a.end - a.start));
    for (const s of spans) painted.fill(s.cls, s.start, s.end);

    const out = [];
    let i = 0;
    while (i < text.length) {
      const cls = painted[i];
      if (!cls) { i++; continue; }
      let j = i + 1;
      while (j < text.length && painted[j] === cls) j++;
      out.push({ start: i, end: j, cls });
      i = j;
    }
    return out;
  }

  return { highlight };
}
