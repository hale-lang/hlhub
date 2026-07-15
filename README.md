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

```
content script (github.com)          background worker
┌────────────────────────────┐      ┌──────────────────────────────┐
│ find hale/ap/lotus fences  │ text │ web-tree-sitter + wasm       │
│ MutationObserver for SPA   │─────▶│ grammar + highlights.scm     │
│ apply spans as pl-* <span>s│◀─────│ captures → flat class spans  │
└────────────────────────────┘ spans└──────────────────────────────┘
```

Parsing lives in the background worker because github.com's page CSP blocks
WebAssembly compilation in content scripts; the extension's own context allows
it via `wasm-unsafe-eval`.

- `src/core.js` — wasm parser + query → non-overlapping `{start, end, cls}` spans
- `src/mapping.js` — tree-sitter capture names → Primer classes (the tuning knob)
- `src/dom.js` — fence discovery selectors + span application
- `src/background.js` / `src/content.js` — extension wiring
- `vendor/` — `tree-sitter-hale.wasm`, `web-tree-sitter.wasm`, `hale-highlights.scm`

## Build

```sh
npm install
npm run build        # bundles to dist/, rebuilds fixture/bundle.js
```

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
npm test             # node smoke test: parse the grammar's example, count captures
npm run fixture      # serve the repo; open http://localhost:8123/fixture/
```

`fixture/index.html` reproduces GitHub's markup for unknown-language fences and
runs the identical core + DOM pipeline in-page.

## Roadmap

- [x] Milestone 1 — fenced code blocks in READMEs, issues, PRs
- [ ] Milestone 2 — the file (blob) view for `.hl` files. Harder: GitHub's code
      view virtualizes line rendering, so this needs per-line patching as lines
      mount, not one-shot rendering.
- [ ] Publish to Chrome Web Store / AMO so teammates don't need dev-mode loads
- [ ] Long-term: once Hale has enough public adoption, upstream to Linguist so
      highlighting works for everyone with no extension
