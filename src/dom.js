// Apply highlight spans to a <code>/<pre> element, preserving exact text.
export function applySpans(el, text, spans) {
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) frag.append(text.slice(pos, s.start));
    const span = document.createElement('span');
    span.className = s.cls;
    span.textContent = text.slice(s.start, s.end);
    frag.append(span);
    pos = s.end;
  }
  if (pos < text.length) frag.append(text.slice(pos));
  el.replaceChildren(frag);
}

const LANGS = ['hale', 'ap', 'lotus'];

// GitHub renders fences for languages Linguist doesn't know in a few shapes
// depending on surface (README, issue/PR comment, wiki). Cover them all;
// unmatched selectors simply never fire.
export const FENCE_SELECTOR = [
  ...LANGS.map((l) => `pre[lang="${l}"]`),
  ...LANGS.map((l) => `code.language-${l}`),
  ...LANGS.map((l) => `div.highlight-source-${l} pre`),
].join(', ');

// Collect unprocessed fence targets in `root` (inclusive). Returns the
// element whose text content is the raw code (the <code> child if present).
export function findFenceTargets(root) {
  const hits = new Set();
  if (root.matches?.(FENCE_SELECTOR)) hits.add(root);
  for (const el of root.querySelectorAll?.(FENCE_SELECTOR) ?? []) hits.add(el);
  return [...hits]
    .map((el) => (el.tagName === 'CODE' ? el : el.querySelector('code') ?? el))
    .filter((el) => !el.dataset.hlhub);
}
