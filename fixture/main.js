// Fixture driver: runs the real Hale-module pipeline in a plain page (no
// extension messaging) against GitHub-shaped markup. Serve the repo root
// over HTTP — wasm can't be fetched from file://.
import { createHaleHighlighter } from '../src/hale-core.js';
import { applySpans, findFenceTargets } from '../src/dom.js';

const status = document.getElementById('status');
try {
  const hl = await createHaleHighlighter({
    wasmBytes: await (await fetch('../hale/main.wasm')).arrayBuffer(),
    queryText: await (await fetch('../vendor/hale-highlights.scm')).text(),
    locate: (f) => `../vendor/${f}`,
  });
  const targets = findFenceTargets(document.body);
  for (const el of targets) {
    const text = el.textContent;
    applySpans(el, text, hl.highlight(text));
    el.dataset.hlhub = 'done';
  }
  status.textContent = `highlighted ${targets.length} block(s) (via hale/main.wasm)`;
} catch (err) {
  status.textContent = `error: ${err}`;
  throw err;
}
