// Fixture driver: runs the real core + DOM pipeline in a plain page (no
// extension messaging) against GitHub-shaped markup. Serve the repo root
// over HTTP — wasm can't be fetched from file://.
import { createHighlighter } from '../src/core.js';
import { applySpans, findFenceTargets } from '../src/dom.js';

const status = document.getElementById('status');
try {
  const hl = await createHighlighter((file) => `../vendor/${file}`);
  const targets = findFenceTargets(document.body);
  for (const el of targets) {
    const text = el.textContent;
    applySpans(el, text, hl.highlight(text));
    el.dataset.hlhub = 'done';
  }
  status.textContent = `highlighted ${targets.length} block(s)`;
} catch (err) {
  status.textContent = `error: ${err}`;
  throw err;
}
