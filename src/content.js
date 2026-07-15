// Content script: find Hale code on github.com — fenced blocks in
// rendered markdown plus the .hl file (blob) view — ship text to the
// background parser, apply the returned spans using GitHub's own pl-*
// token classes (so colors follow the viewer's GitHub theme).
import { applySpans, findFenceTargets } from './dom.js';
import { createBlobHighlighter } from './blob.js';

const api = globalThis.browser ?? globalThis.chrome;

async function requestSpans(text) {
  const res = await api.runtime.sendMessage({ type: 'hlhub:highlight', text });
  if (!res?.ok) throw new Error(res?.error ?? 'highlight failed');
  return res.spans;
}

// ---- fenced code blocks ----

async function highlightFence(el) {
  el.dataset.hlhub = 'pending';
  const text = el.textContent;
  let spans;
  try {
    spans = await requestSpans(text);
  } catch {
    el.dataset.hlhub = 'error';
    return;
  }
  // GitHub may have re-rendered the block while we were parsing.
  if (el.textContent !== text) {
    delete el.dataset.hlhub;
    return;
  }
  applySpans(el, text, spans);
  el.dataset.hlhub = 'done';
}

function scanFences(rootEl) {
  for (const el of findFenceTargets(rootEl)) highlightFence(el);
}

// ---- blob view ----

const blob = createBlobHighlighter(requestSpans);

let blobScheduled = false;
function scheduleBlob() {
  if (blobScheduled) return;
  blobScheduled = true;
  requestAnimationFrame(() => {
    blobScheduled = false;
    blob.refresh();
  });
}

// ---- wiring ----

scanFences(document.body);
scheduleBlob();

// GitHub is a SPA (Turbo + React): new content arrives without page
// loads, and the code view mounts/recycles line divs while scrolling.
new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) scanFences(node);
    }
  }
  scheduleBlob();
}).observe(document.documentElement, { childList: true, subtree: true });
