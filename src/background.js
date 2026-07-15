// Background worker: owns the wasm parser so content scripts never have to
// compile WebAssembly under github.com's page CSP. Content scripts send raw
// text, we reply with class spans.
import { createHighlighter } from './core.js';

const api = globalThis.browser ?? globalThis.chrome;

let ready = null;
const init = () =>
  (ready ??= createHighlighter((file) => api.runtime.getURL(`vendor/${file}`)));

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'hlhub:highlight') return;
  init()
    .then((hl) => sendResponse({ ok: true, spans: hl.highlight(msg.text) }))
    .catch((err) => {
      ready = null; // allow retry after a failed init
      sendResponse({ ok: false, error: String(err) });
    });
  return true; // keep the channel open for the async response
});
