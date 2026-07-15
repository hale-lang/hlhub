// Background worker: hosts the Hale-built highlighter module (parse
// orchestration + capture→class mapping run inside hale/main.wasm; the
// tsa shim backs it with web-tree-sitter). Content scripts send raw
// text, we reply with class spans. Parsing lives here because
// github.com's page CSP blocks WebAssembly compilation in content
// scripts; the extension's own context allows it via wasm-unsafe-eval.
import { createHaleHighlighter } from './hale-core.js';

const api = globalThis.browser ?? globalThis.chrome;

let ready = null;
const init = () =>
  (ready ??= (async () => {
    const [wasmBytes, queryText] = await Promise.all([
      fetch(api.runtime.getURL('hale/main.wasm')).then((r) => r.arrayBuffer()),
      fetch(api.runtime.getURL('vendor/hale-highlights.scm')).then((r) => r.text()),
    ]);
    return createHaleHighlighter({
      wasmBytes,
      queryText,
      locate: (f) => api.runtime.getURL(`vendor/${f}`),
    });
  })());

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'hlhub:highlight') return;
  init()
    .then((hl) => sendResponse({ ok: true, spans: hl.highlight(msg.text) }))
    .catch((err) => {
      ready = null; // allow retry after a failed init
      console.error('[hlhub] highlighter init/run failed:', err);
      sendResponse({ ok: false, error: String(err) });
    });
  return true; // keep the channel open for the async response
});
