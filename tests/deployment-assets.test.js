/**
 * Deployment & Static Assets Regression Tests — AR-CookVision Phase 7
 *
 * Verifies presence, accessibility, and size thresholds of all critical
 * static assets required for MindAR tracking, MediaPipe Computer Vision,
 * and production deployment.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const publicDir = path.join(rootDir, 'public')

describe('Deployment & Static Assets — Asset Verification', () => {
  test('MindAR compiled image target (.mind) is present and non-empty', () => {
    const targetFile = path.join(publicDir, 'targets', 'targets.mind')
    assert.ok(fs.existsSync(targetFile), 'targets.mind must exist in public/targets/')

    const stat = fs.statSync(targetFile)
    assert.ok(stat.size > 500000, `targets.mind should be > 500KB (actual: ${stat.size} bytes)`)
  })

  test('AR marker images exist with valid image headers (JPEG/PNG)', () => {
    const markerFiles = ['marker.png', 'marker-print.png']
    const pngSignature = [0x89, 0x50, 0x4e, 0x47]
    const jpegSignature = [0xff, 0xd8, 0xff]

    for (const name of markerFiles) {
      const file = path.join(publicDir, 'targets', name)
      assert.ok(fs.existsSync(file), `${name} must exist in public/targets/`)

      const stat = fs.statSync(file)
      assert.ok(stat.size > 100000, `${name} should be > 100KB (actual: ${stat.size} bytes)`)

      const fd = fs.openSync(file, 'r')
      const buffer = Buffer.alloc(4)
      fs.readSync(fd, buffer, 0, 4, 0)
      fs.closeSync(fd)

      const isJpeg = buffer[0] === jpegSignature[0] && buffer[1] === jpegSignature[1] && buffer[2] === jpegSignature[2]
      const isPng = buffer[0] === pngSignature[0] && buffer[1] === pngSignature[1] && buffer[2] === pngSignature[2] && buffer[3] === pngSignature[3]
      assert.ok(isJpeg || isPng, `${name} must have valid JPEG or PNG magic header bytes`)
    }
  })

  test('MediaPipe HandLandmarker task model is present and non-empty', () => {
    const modelFile = path.join(publicDir, 'models', 'hand_landmarker.task')
    assert.ok(fs.existsSync(modelFile), 'hand_landmarker.task must exist in public/models/')

    const stat = fs.statSync(modelFile)
    assert.ok(stat.size > 5000000, `hand_landmarker.task should be > 5MB (actual: ${stat.size} bytes)`)
  })

  test('MediaPipe WASM runtime files (binary & JS loader) exist in public/wasm/', () => {
    const requiredWasmFiles = [
      { name: 'vision_wasm_internal.wasm', minSize: 10000000 },
      { name: 'vision_wasm_internal.js', minSize: 200000 },
      { name: 'vision_wasm_module_internal.wasm', minSize: 10000000 },
      { name: 'vision_wasm_module_internal.js', minSize: 200000 },
      { name: 'vision_wasm_nosimd_internal.wasm', minSize: 10000000 },
      { name: 'vision_wasm_nosimd_internal.js', minSize: 200000 },
    ]

    for (const fileDef of requiredWasmFiles) {
      const filePath = path.join(publicDir, 'wasm', fileDef.name)
      assert.ok(fs.existsSync(filePath), `WASM asset ${fileDef.name} must exist`)

      const stat = fs.statSync(filePath)
      assert.ok(
        stat.size >= fileDef.minSize,
        `${fileDef.name} size (${stat.size} bytes) must meet minimum threshold (${fileDef.minSize} bytes)`
      )
    }
  })

  test('Application icons and favicons exist with valid SVG content', () => {
    const iconsSvg = path.join(publicDir, 'icons.svg')
    assert.ok(fs.existsSync(iconsSvg), 'icons.svg must exist')
    const iconsContent = fs.readFileSync(iconsSvg, 'utf-8')
    assert.ok(iconsContent.includes('<svg'), 'icons.svg must contain valid SVG root element')

    const faviconSvg = path.join(publicDir, 'favicon.svg')
    assert.ok(fs.existsSync(faviconSvg), 'favicon.svg must exist')
    const faviconContent = fs.readFileSync(faviconSvg, 'utf-8')
    assert.ok(faviconContent.includes('<svg'), 'favicon.svg must contain valid SVG root element')
  })

  test('Diagnostic and target compilation standalone HTML tools exist', () => {
    const cameraTestHtml = path.join(publicDir, 'camera-test.html')
    assert.ok(fs.existsSync(cameraTestHtml), 'camera-test.html must exist')

    const compileHtml = path.join(publicDir, 'compile.html')
    assert.ok(fs.existsSync(compileHtml), 'compile.html must exist')
  })

  test('Root index.html includes essential mobile viewport and entry script tags', () => {
    const indexHtml = path.join(rootDir, 'index.html')
    assert.ok(fs.existsSync(indexHtml), 'index.html must exist at repository root')

    const htmlContent = fs.readFileSync(indexHtml, 'utf-8')
    assert.ok(htmlContent.includes('<meta name="viewport"'), 'index.html must define viewport meta')
    assert.ok(htmlContent.includes('width=device-width'), 'index.html must specify width=device-width')
    assert.ok(htmlContent.includes('user-scalable=no'), 'index.html must specify user-scalable=no for AR gesture stability')
    assert.ok(htmlContent.includes('<div id="root"></div>'), 'index.html must define #root mounting point')
    assert.ok(htmlContent.includes('/src/main.jsx'), 'index.html must load /src/main.jsx')
  })
})
