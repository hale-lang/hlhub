// Content script: find Hale code fences on github.com, ship their text to
// the background parser, apply the returned spans using GitHub's own pl-*
// token classes (so colors follow the viewer's GitHub theme).
import { applySpans, findFenceTargets } from './dom.js';

const api = globalThis.browser ?? globalThis.chrome;

async function highlightEl(el) {
  el.dataset.hlhub = 'pending';
  const text = el.textContent;
  let res;
  try {
    res = await api.runtime.sendMessage({ type: 'hlhub:highlight', text });
  } catch {
    res = null;
  }
  if (!res?.ok) {
    el.dataset.hlhub = 'error';
    return;
  }
  // GitHub may have re-rendered the block while we were parsing.
  if (el.textContent !== text) {
    delete el.dataset.hlhub;
    return;
  }
  applySpans(el, text, res.spans);
  el.dataset.hlhub = 'done';
}

function scan(root) {
  for (const el of findFenceTargets(root)) highlightEl(el);
}

scan(document.body);

// GitHub is a SPA (Turbo + React): new content arrives without page loads.
new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) scan(node);
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });
