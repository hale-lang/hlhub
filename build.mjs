import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';

for (const dir of ['dist', 'dist-firefox']) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

// web-tree-sitter's emscripten glue dynamically imports node builtins behind
// runtime environment checks; they never run in the browser, so leave them
// unresolved instead of bundling for node.
const common = {
  bundle: true,
  format: 'iife',
  logLevel: 'info',
  external: ['fs/promises', 'module', 'fs', 'path'],
};

await build({ ...common, entryPoints: ['src/background.js'], outfile: 'dist/background.js' });
await build({ ...common, entryPoints: ['src/content.js'], outfile: 'dist/content.js' });
// Standalone bundle for the local fixture page (no extension machinery).
// esm because main.js uses top-level await; loaded via <script type="module">.
await build({ ...common, format: 'esm', entryPoints: ['fixture/main.js'], outfile: 'fixture/bundle.js' });

// Per-browser manifests from the one source manifest: Chrome hard-errors
// on background.scripts under MV3, Firefox doesn't support service
// workers — each gets only its own background key.
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

const chrome = structuredClone(manifest);
delete chrome.browser_specific_settings; // Firefox-only; Chrome warns on it
writeFileSync('dist/manifest.json', JSON.stringify(chrome, null, 2));

const firefox = structuredClone(manifest);
firefox.background = { scripts: ['background.js'] };
writeFileSync('dist-firefox/manifest.json', JSON.stringify(firefox, null, 2));

for (const dir of ['dist', 'dist-firefox']) {
  if (dir !== 'dist') {
    cpSync('dist/background.js', `${dir}/background.js`);
    cpSync('dist/content.js', `${dir}/content.js`);
  }
  cpSync('vendor', `${dir}/vendor`, { recursive: true });
  mkdirSync(`${dir}/hale`, { recursive: true });
  cpSync('hale/main.wasm', `${dir}/hale/main.wasm`);
}

console.log('dist/ (Chrome) and dist-firefox/ ready — load as unpacked extensions.');
