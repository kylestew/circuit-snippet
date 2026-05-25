import { build } from 'esbuild';

// IIFE bundle — single <script> tag, no module system needed
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/circuit-snippet.js',
  minify: true,
  sourcemap: true,
  target: 'es2022',
});

// ESM bundle — for bundlers / import
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/circuit-snippet.esm.js',
  minify: true,
  sourcemap: true,
  target: 'es2022',
});

const fs = await import('fs');
const iife = fs.statSync('dist/circuit-snippet.js').size;
const esm = fs.statSync('dist/circuit-snippet.esm.js').size;
console.log(`IIFE: ${(iife / 1024).toFixed(1)}KB | ESM: ${(esm / 1024).toFixed(1)}KB`);
