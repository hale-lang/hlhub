import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

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

cpSync('manifest.json', 'dist/manifest.json');
cpSync('vendor', 'dist/vendor', { recursive: true });
mkdirSync('dist/hale', { recursive: true });
cpSync('hale/main.wasm', 'dist/hale/main.wasm');

console.log('dist/ ready — load it as an unpacked extension.');
