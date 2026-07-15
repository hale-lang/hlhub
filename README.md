# highlight-hub

**highlight-hub** (`hlhub`) is a browser extension (Chrome + Firefox, Manifest
V3) that adds syntax highlighting for the
[Hale](https://github.com/hale-lang) language on github.com, powered by the
real tree-sitter grammar compiled to WebAssembly.

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
- `hale/vendor/pond` — symlink to a local pond checkout so
  `import "vendor/pond/heron"` tracks the working tree

## Build

```sh
npm install
npm run build:hale   # hale build hale/main.hl --target wasm32 (needs hale CLI)
npm run build        # bundles to dist/, rebuilds fixture/bundle.js
```

`hale/main.wasm` is committed (like `vendor/*.wasm`), so `npm run build` works
without the Hale toolchain; rerun `build:hale` after editing `hale/main.hl`.

### Working on the Hale core or the grammar

`hale/vendor/pond` is a symlink to a local checkout of
[hale-lang/pond](https://github.com/hale-lang/pond), so the build tracks your
pond working tree instead of a `hale fetch` snapshot. Fresh clones need it
pointed somewhere real:

```sh
git clone https://github.com/hale-lang/pond ~/code/hale-lang/pond  # or wherever
ln -sfn ~/code/hale-lang/pond hale/vendor/pond
npm run build:wasm   # grammar → vendor/tree-sitter-hale.wasm (tree-sitter CLI)
npm run build:hale   # hale/main.hl → hale/main.wasm, syncs highlights.scm (hale CLI)
```

Neither is needed to hack on the JS glue or to load the extension — the wasm
artifacts are committed.

To refresh the grammar after editing `~/code/hale-lang/pond/heron`:

```sh
npm run build:wasm   # recompiles vendor/tree-sitter-hale.wasm (tree-sitter CLI)
cp ~/code/hale-lang/pond/heron/queries/highlights.scm vendor/hale-highlights.scm
npm run build
```

## Install

No toolchain needed: grab the zip for your browser from the
[latest release](https://github.com/hale-lang/hlhub/releases/latest) and unzip it.

- **Chrome**: `chrome://extensions` → Developer mode → *Load unpacked* → pick the
  unzipped `hlhub-chrome` folder.
- **Firefox**: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* →
  pick `manifest.json` inside the unzipped `hlhub-firefox` folder.

Building from a clone works too — `npm install && npm run build`, then load
`dist/` (Chrome) or `dist-firefox/` (Firefox) the same way.

The build emits one directory per browser: Chrome MV3 hard-errors on
`background.scripts`, while Firefox has no service-worker background — so
`dist/` uses `service_worker` and `dist-firefox/` uses `scripts`, from the
same bundles.

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

## Troubleshooting

The extension logs everything as `console.debug` under a `[hlhub]` prefix —
open DevTools on a GitHub page, enable **Verbose** in the console levels, and
filter for `hlhub`. You should see `content script active`, then per-file
lines like `got 319 spans → 150 styled lines` and patch stats. A `patch:`
line with `"total":0` means GitHub shipped a code-view markup variant we
don't select yet (there are already two: the anonymous virtualized view keys
lines by `data-line-number`, the logged-in no-virtualization view only by
`id="LC<n>"`) — the log dumps the nearest candidate markup; please file it.
Background-worker errors surface in the service-worker console
(`chrome://extensions` → hlhub → *service worker*).

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
      — tracked as [hale-lang/hale#213](https://github.com/hale-lang/hale/issues/213)
- [ ] Publish to Chrome Web Store / AMO so teammates don't need dev-mode loads
- [ ] Long-term: once Hale has enough public adoption, upstream to Linguist so
      highlighting works for everyone with no extension
