// Smoke test: run the exact wasm + query pipeline the extension uses,
// but in Node, against the grammar's example file.
import { readFileSync } from 'node:fs';
import { Parser, Language, Query } from 'web-tree-sitter';

const SAMPLE = process.argv[2] ?? '~/code/hale-lang/pond/heron/examples/parse_demo.hl';

await Parser.init();
const lang = await Language.load(new URL('../vendor/tree-sitter-hale.wasm', import.meta.url).pathname);
const parser = new Parser();
parser.setLanguage(lang);

const source = readFileSync(SAMPLE, 'utf8');
const tree = parser.parse(source);
if (!tree) throw new Error('parse returned null');

const query = new Query(lang, readFileSync(new URL('../vendor/hale-highlights.scm', import.meta.url).pathname, 'utf8'));
const captures = query.captures(tree.rootNode);

console.log(`source: ${source.length} chars, ${source.split('\n').length} lines`);
console.log(`root node: ${tree.rootNode.type}, hasError: ${tree.rootNode.hasError}`);
console.log(`captures: ${captures.length}`);

const byName = {};
for (const c of captures) byName[c.name] = (byName[c.name] ?? 0) + 1;
console.log(Object.entries(byName).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`).join('\n'));

// Show the first few captures with their text so a human can sanity-check.
for (const c of captures.slice(0, 10)) {
  console.log(`${c.name.padEnd(20)} ${JSON.stringify(c.node.text.slice(0, 40))}`);
}
