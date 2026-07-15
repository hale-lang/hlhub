// Highlighting core: wasm parser + highlights query -> flat class spans.
// Environment-agnostic; the caller supplies `locate(file)` returning a
// fetchable URL for files under vendor/ (extension URL in the background
// worker, relative path in the fixture page).
import { Parser, Language, Query } from 'web-tree-sitter';
import { classForCapture } from './mapping.js';

// Blocks larger than this are left unhighlighted rather than risk jank.
const MAX_CHARS = 200_000;

export async function createHighlighter(locate) {
  await Parser.init({ locateFile: (name) => locate(name) });
  const lang = await Language.load(locate('tree-sitter-hale.wasm'));
  const queryText = await (await fetch(locate('hale-highlights.scm'))).text();
  const query = new Query(lang, queryText);
  const parser = new Parser();
  parser.setLanguage(lang);

  // Returns non-overlapping spans [{start, end, cls}] over JS string indices,
  // sorted by start. Innermost capture wins where captures nest.
  function highlight(text) {
    if (text.length > MAX_CHARS) return [];
    const tree = parser.parse(text);
    if (!tree) return [];
    try {
      const captures = query.captures(tree.rootNode);
      const painted = new Array(text.length).fill(null);
      const spans = [];
      for (const { name, node } of captures) {
        const cls = classForCapture(name);
        if (cls) spans.push({ start: node.startIndex, end: node.endIndex, cls });
      }
      // Paint widest spans first so nested (narrower) captures overwrite them.
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
    } finally {
      tree.delete();
    }
  }

  return { highlight };
}
