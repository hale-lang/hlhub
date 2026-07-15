// End-to-end test of the production pipeline: the Hale-built wasm module
// (protocol + capture→class mapping in Hale) with the web-tree-sitter
// tsa shim behind it — the exact code path the extension background runs.
import { readFileSync } from 'node:fs';
import { createHaleHighlighter } from '../src/hale-core.js';

const root = new URL('..', import.meta.url).pathname;
const SAMPLE = process.argv[2] ?? '~/code/hale-lang/pond/heron/examples/parse_demo.hl';

const hl = await createHaleHighlighter({
  wasmBytes: readFileSync(`${root}hale/main.wasm`),
  queryText: readFileSync(`${root}vendor/hale-highlights.scm`, 'utf8'),
  locate: (f) => `${root}vendor/${f}`,
});

const text = readFileSync(SAMPLE, 'utf8');
const spans = hl.highlight(text);

console.log(`source: ${text.length} chars; spans: ${spans.length}`);
const byCls = {};
for (const s of spans) byCls[s.cls] = (byCls[s.cls] ?? 0) + 1;
console.log(Object.entries(byCls).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
for (const s of spans.slice(0, 8)) {
  console.log(`${s.cls.padEnd(8)} ${JSON.stringify(text.slice(s.start, s.end)).slice(0, 50)}`);
}

// Invariants the DOM path depends on.
let prevEnd = 0;
for (const s of spans) {
  if (s.start < prevEnd) throw new Error(`overlapping spans at ${s.start}`);
  if (s.end > text.length) throw new Error(`span past end: ${s.end}`);
  prevEnd = s.end;
}
if (spans.length < 20) throw new Error('suspiciously few spans');
if (!spans.some((s) => s.cls === 'pl-k')) throw new Error('no keyword spans');
if (!spans.some((s) => s.cls === 'pl-c')) throw new Error('no comment spans');
console.log('hale-smoke OK');
