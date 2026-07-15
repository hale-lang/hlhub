# hlhub

Browser extension (Chrome + Firefox, Manifest V3) that adds syntax highlighting
for the [Hale](https://github.com/hale-lang) language on github.com, powered by
the real tree-sitter grammar compiled to WebAssembly.

GitHub only highlights languages known to [Linguist](https://github.com/github-linguist/linguist),
and Linguist's contribution bar (hundreds of public repos using the language)
rules out custom languages. hlhub does it client-side instead: parse with
`web-tree-sitter`, run the grammar's own `highlights.scm`, and emit `<span>`s
using **GitHub's own Primer token classes** (`pl-k`, `pl-s`, `pl-c`, …) so
colors automatically follow the viewer's GitHub theme — light, dark, or
colorblind variants — with no CSS of our own.

## Architecture

The plugin's brain is written **in Hale**, compiled to wasm with
`hale build --target wasm32`. JS is reduced to what a browser demands: DOM
glue, extension messaging, and a parser shim.

```
content script (github.com)     background worker
┌──────────────────────────┐    ┌───────────────────────────────────────┐
│ find hale/ap/lotus       │text│ hale/main.wasm  (written in Hale)     │
│ fences; MutationObserver │───▶│  Highlighter locus: parse protocol,   │
│ apply spans as pl-*      │◀───│  capture→pl-* mapping, row rewriting  │
│ <span>s                  │spans│      ▲ tsa_* imports                 │
└──────────────────────────┘    │      ▼                                │
                                │ tsa shim (JS): web-tree-sitter        │
                                │ grammar wasm + highlights.scm         │
                                └───────────────────────────────────────┘
```

Why the shim: `hale build --target wasm32` doesn't yet compile a package's
`[ffi]` csrc (heron's glue.c + tree-sitter), so those symbols surface as wasm
`env` imports — which we satisfy from JS with web-tree-sitter, mirroring
glue.c's contracts. When the toolchain closes that gap, the shim deletes and
the same `main.hl` links the real C parser directly.

Parsing lives in the background worker because github.com's page CSP blocks
WebAssembly compilation in content scripts; the extension's own context allows
it via `wasm-unsafe-eval`.

- `hale/main.hl` — the highlighter, in Hale: `@export locus Highlighter`,
  capture→Primer-class mapping (the tuning knob), row rewriting
- `src/hale-core.js` — loads hale/main.wasm, inbox/emit protocol, span flattening
- `src/tsa-glue.js` — web-tree-sitter shim behind the module's `tsa_*` imports
- `src/dom.js` — fence discovery selectors + span application
- `src/background.js` / `src/content.js` — extension wiring
- `vendor/` — `tree-sitter-hale.wasm`, `web-tree-sitter.wasm`, `hale-highlights.scm`
- `hale/vendor/pond` — symlink to `~/code/hale-lang/pond` (the local-symlink dev
  convention) so `import "vendor/pond/heron"` tracks the working tree

## Build

```sh
npm install
npm run build:hale   # hale build hale/main.hl --target wasm32 (needs hale CLI)
npm run build        # bundles to dist/, rebuilds fixture/bundle.js
```

`hale/main.wasm` is committed (like `vendor/*.wasm`), so `npm run build` works
without the Hale toolchain; rerun `build:hale` after editing `hale/main.hl`.

To refresh the grammar after editing `~/code/hale-lang/pond/heron`:

```sh
npm run build:wasm   # recompiles vendor/tree-sitter-hale.wasm (tree-sitter CLI)
cp ~/code/hale-lang/pond/heron/queries/highlights.scm vendor/hale-highlights.scm
npm run build
```

## Load the extension

- **Chrome**: `chrome://extensions` → Developer mode → *Load unpacked* → pick `dist/`.
- **Firefox**: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* →
  pick `dist/manifest.json`. (Chrome ignores the Firefox-only manifest keys and
  vice versa; one `dist/` serves both.)

Then open any GitHub README / issue / PR comment containing a fenced block
tagged `hale`, `ap`, or `lotus`.

## Test

```sh
npm test             # node smoke tests: grammar wasm + the full Hale pipeline
npm run test:e2e     # Playwright: loads dist/ into Chromium against real
                     # github.com pages (fence + virtualized blob view)
npm run fixture      # serve the repo; open http://localhost:8123/fixture/
```

`fixture/index.html` reproduces GitHub's markup for unknown-language fences and
runs the identical core + DOM pipeline in-page. The e2e needs
`npx playwright install chromium --no-shell` once (the default headless shell
can't load extensions; branded Google Chrome ignores `--load-extension`
entirely).

## Known limits

- Files/fences over 64 KB are left unstyled (the Hale wasm runtime's inbox is
  a fixed 64 KB slot); same for query results past 64 KB, which truncate at a
  row boundary.
- Fence snippets that aren't valid top-level Hale get partial highlighting —
  tree-sitter's error recovery only captures what still parses.

## Roadmap

- [x] Milestone 1 — fenced code blocks in READMEs, issues, PRs
- [x] Milestone 2 — the `.hl` file (blob) view: full text from the cursor
      textarea, one parse, per-line span patching as GitHub's virtualized
      React view mounts/recycles line divs (verified on real github.com via
      the Playwright e2e)
- [ ] Delete the tsa shim once `hale build --target wasm32` compiles package
      `[ffi]` csrc (then heron's glue.c + real tree-sitter C link in directly)
- [ ] Publish to Chrome Web Store / AMO so teammates don't need dev-mode loads
- [ ] Long-term: once Hale has enough public adoption, upstream to Linguist so
      highlighting works for everyone with no extension
