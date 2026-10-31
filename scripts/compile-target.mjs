/**
 * MindAR Image Target Compiler Script
 * 
 * This script compiles marker.png into targets.mind for MindAR image tracking.
 * Requires the `canvas` npm package to be properly installed with native bindings.
 * 
 * Usage: node scripts/compile-target.mjs
 */

import { OfflineCompiler } from 'mind-ar/src/image-target/offline-compiler.js';
import { loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MARKER_PATH = path.resolve(__dirname, '..', 'public', 'targets', 'marker.png');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'public', 'targets', 'targets.mind');

async function compile() {
  console.log('Loading marker image:', MARKER_PATH);
  const image = await loadImage(MARKER_PATH);
  console.log(`Marker loaded: ${image.width}x${image.height}`);

  const compiler = new OfflineCompiler();

  console.log('Compiling image target (this may take a minute)...');
  await compiler.compileImageTargets([image], (progress) => {
    process.stdout.write(`\rProgress: ${Math.round(progress)}%`);
  });
  console.log('\nCompilation complete.');

  const buffer = compiler.exportData();
  fs.writeFileSync(OUTPUT_PATH, Buffer.from(buffer));
  console.log(`Saved: ${OUTPUT_PATH} (${buffer.byteLength} bytes)`);
}

compile().catch((err) => {
  console.error('Compilation failed:', err.message);
  process.exit(1);
});
