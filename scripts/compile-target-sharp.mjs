/**
 * MindAR Image Target Compiler — Sharp-based (no native canvas required)
 * 
 * This script compiles marker.png into targets.mind by:
 * 1. Using `sharp` to load the image and extract raw RGBA pixel data
 * 2. Mocking the canvas/context API that MindAR's CompilerBase expects
 * 3. Running the MindAR compiler pipeline (feature extraction + tracking)
 * 4. Exporting the compiled .mind file
 *
 * Usage: node scripts/compile-target-sharp.mjs
 */

import { CompilerBase } from 'mind-ar/src/image-target/compiler-base.js';
import { buildTrackingImageList } from 'mind-ar/src/image-target/image-list.js';
import { extractTrackingFeatures } from 'mind-ar/src/image-target/tracker/extract-utils.js';
import 'mind-ar/src/image-target/detector/kernels/cpu/index.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MARKER_PATH = path.resolve(__dirname, '..', 'public', 'targets', 'marker.png');
const OUTPUT_PATH = path.resolve(__dirname, '..', 'public', 'targets', 'targets.mind');

/**
 * SharpCompiler — extends CompilerBase, replacing native canvas with sharp pixel data
 */
class SharpCompiler extends CompilerBase {
  constructor() {
    super();
    this._imageBuffers = new Map();
  }

  /**
   * Register raw RGBA pixel data for an image so createProcessCanvas can use it.
   */
  registerImageData(img, rgbaBuffer) {
    this._imageBuffers.set(img, rgbaBuffer);
  }

  /**
   * Creates a mock canvas + 2D context that returns pre-loaded pixel data.
   * MindAR only calls getContext('2d'), drawImage(), and getImageData().
   */
  createProcessCanvas(img) {
    const rgbaBuffer = this._imageBuffers.get(img);
    if (!rgbaBuffer) {
      throw new Error('Image data not registered for this image object');
    }

    const mockCanvas = {
      width: img.width,
      height: img.height,
      getContext: () => ({
        drawImage: () => {
          // No-op: data is already loaded via sharp
        },
        getImageData: (x, y, w, h) => ({
          data: new Uint8ClampedArray(rgbaBuffer),
          width: w,
          height: h,
        }),
      }),
    };
    return mockCanvas;
  }

  /**
   * Synchronous tracking feature extraction (same as OfflineCompiler).
   */
  compileTrack({ progressCallback, targetImages, basePercent }) {
    return new Promise((resolve) => {
      const percentPerImage = (100 - basePercent) / targetImages.length;
      let percent = 0;
      const list = [];

      for (let i = 0; i < targetImages.length; i++) {
        const targetImage = targetImages[i];
        const imageList = buildTrackingImageList(targetImage);
        const percentPerAction = percentPerImage / imageList.length;

        const trackingData = extractTrackingFeatures(imageList, () => {
          percent += percentPerAction;
          progressCallback(basePercent + percent);
        });
        list.push(trackingData);
      }
      resolve(list);
    });
  }
}

async function compile() {
  console.log('Loading marker image:', MARKER_PATH);

  if (!fs.existsSync(MARKER_PATH)) {
    console.error('ERROR: Marker file not found:', MARKER_PATH);
    process.exit(1);
  }

  // Load image with sharp and get raw RGBA pixel buffer
  const sharpImage = sharp(MARKER_PATH);
  const metadata = await sharpImage.metadata();
  const width = metadata.width;
  const height = metadata.height;
  console.log(`Marker loaded: ${width}x${height} (${metadata.format})`);

  const rgbaBuffer = await sharpImage
    .ensureAlpha()
    .raw()
    .toBuffer();

  console.log(`Raw pixel data: ${rgbaBuffer.length} bytes (${width}*${height}*4 = ${width * height * 4})`);

  // Create a mock image object that looks like an HTMLImageElement
  const mockImage = { width, height };

  const compiler = new SharpCompiler();
  compiler.registerImageData(mockImage, rgbaBuffer);

  console.log('Compiling image target (this may take 1-3 minutes)...');
  const startTime = Date.now();

  await compiler.compileImageTargets([mockImage], (progress) => {
    const pct = Math.round(progress);
    process.stdout.write(`\rProgress: ${pct}%`);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompilation complete in ${elapsed}s.`);

  const buffer = compiler.exportData();
  fs.writeFileSync(OUTPUT_PATH, Buffer.from(buffer));

  const stats = fs.statSync(OUTPUT_PATH);
  console.log(`Saved: ${OUTPUT_PATH}`);
  console.log(`File size: ${stats.size} bytes (${(stats.size / 1024).toFixed(1)} KB)`);

  if (stats.size === 0) {
    console.error('ERROR: Generated file is empty!');
    process.exit(1);
  }

  console.log('SUCCESS: targets.mind generated.');
}

compile().catch((err) => {
  console.error('Compilation failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
