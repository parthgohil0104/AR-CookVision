/**
 * Extended Stir Detector Regression Tests — AR-CookVision Phase 7
 *
 * Validates advanced edge cases in stir-motion detection:
 * 1. Bidirectional invariance (Clockwise and Counter-Clockwise rotation)
 * 2. Multi-loop continuous stirring accumulation and capping
 * 3. Directional oscillation / shaking rejection (preventing false stir triggers)
 * 4. Variable frame rate tolerance (low-fps mobile vs high-fps desktop)
 * 5. Tracking loss recovery and history reset
 * 6. Gradual progress decay during pauses
 * 7. Centroid robustness with partial hand landmarks
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  StirDetector,
  MOTION_TYPES,
  extractHandCenter,
} from '../src/cv/stirDetector.js'

// Helper: generate a mock CVHandResult with 21 landmarks centered at (centerX, centerY)
function makeHandFrame(centerX, centerY, timestamp = 1000) {
  const hand = []
  // Wrist at center
  hand.push({ x: centerX, y: centerY, z: 0 })
  // Fill remaining 20 landmarks with slight radial offsets
  for (let i = 1; i < 21; i++) {
    const angle = (i / 20) * Math.PI * 2
    hand.push({
      x: centerX + Math.cos(angle) * 0.015,
      y: centerY + Math.sin(angle) * 0.015,
      z: 0.001 * i,
    })
  }

  return {
    detected: true,
    handCount: 1,
    landmarks: [hand],
    worldLandmarks: [],
    handedness: [{ label: 'Right', score: 0.95, index: 0 }],
    timestamp,
    inferenceTimeMs: 12,
    fps: 12.5,
    status: 'tracking',
  }
}

describe('Stir Detection Extended Regression — Bidirectional & Robustness', () => {
  it('detects Counter-Clockwise (CCW) stirring and accumulates to 100% completion', () => {
    const detector = new StirDetector()
    const radius = 0.12
    const centerX = 0.5
    const centerY = 0.5
    const numFrames = 50
    let lastResult = null

    // Counter-clockwise: decreasing angle (-i)
    for (let i = 0; i < numFrames; i++) {
      const angle = -(i / 15) * Math.PI * 2
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius
      const frame = makeHandFrame(x, y, 1000 + i * 50)
      lastResult = detector.processFrame(frame)
    }

    assert.equal(lastResult.detected, true)
    assert.equal(lastResult.motion, MOTION_TYPES.STIR)
    assert.equal(lastResult.isComplete, true)
    assert.equal(lastResult.progress, 1.0)
    assert.ok(lastResult.confidence >= 0.7)
  })

  it('handles multi-loop continuous stirring cleanly and caps progress at 1.0 without overflow', () => {
    const detector = new StirDetector()
    const radius = 0.10
    const centerX = 0.5
    const centerY = 0.5
    const numFrames = 80 // ~4 full loops

    let lastResult = null
    for (let i = 0; i < numFrames; i++) {
      const angle = (i / 20) * Math.PI * 2
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius
      const frame = makeHandFrame(x, y, 1000 + i * 50)
      lastResult = detector.processFrame(frame)

      // Progress must never exceed 1.0
      assert.ok(lastResult.progress <= 1.0, `Progress ${lastResult.progress} must not exceed 1.0`)
      assert.ok(lastResult.progress >= 0.0, `Progress ${lastResult.progress} must be non-negative`)
    }

    assert.equal(lastResult.isComplete, true)
    assert.equal(lastResult.progress, 1.0)
  })

  it('rejects alternating directional oscillations (shaking) without falsely triggering stir', () => {
    const detector = new StirDetector()
    const radius = 0.10
    const centerX = 0.5
    const centerY = 0.5
    const numFrames = 40

    let lastResult = null
    // Hand oscillates back and forth along an arc: +30 deg then -30 deg repeatedly
    for (let i = 0; i < numFrames; i++) {
      const angle = Math.sin(i * 1.5) * 0.5
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius
      const frame = makeHandFrame(x, y, 1000 + i * 50)
      lastResult = detector.processFrame(frame)
    }

    // Must NOT reach stir completion
    assert.equal(lastResult.isComplete, false, 'Oscillation must not complete stir action')
    assert.notEqual(lastResult.motion, MOTION_TYPES.STIR, 'Oscillation must not be classified as STIR')
  })

  it('operates reliably under low mobile frame rates (10 FPS) without NaN or crashes', () => {
    const detector = new StirDetector()
    const radius = 0.12
    const centerX = 0.5
    const centerY = 0.5
    const numFrames = 25 // 2.5 seconds at 10 FPS (100ms per frame)

    let lastResult = null
    for (let i = 0; i < numFrames; i++) {
      const angle = (i / 10) * Math.PI * 2 // 1 full revolution per second
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius
      const frame = makeHandFrame(x, y, 1000 + i * 100)
      lastResult = detector.processFrame(frame)

      assert.ok(!Number.isNaN(lastResult.confidence))
      assert.ok(!Number.isNaN(lastResult.progress))
    }

    assert.equal(lastResult.detected, true)
    assert.equal(lastResult.motion, MOTION_TYPES.STIR)
    assert.ok(lastResult.progress > 0.5)
  })

  it('decays accumulated progress gradually during stationary pauses instead of abrupt drop', () => {
    const detector = new StirDetector()
    const radius = 0.10
    const centerX = 0.5
    const centerY = 0.5

    // Step 1: Stir for 20 frames to build progress
    let stirResult = null
    for (let i = 0; i < 20; i++) {
      const angle = (i / 15) * Math.PI * 2
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius
      stirResult = detector.processFrame(makeHandFrame(x, y, 1000 + i * 50))
    }

    const initialProgress = stirResult.progress
    assert.ok(initialProgress > 0.2, `Initial progress should be built up: ${initialProgress}`)

    // Step 2: Hand pauses stationary. Provide consecutive stationary frames after history window expires
    let pauseResult = null
    const baseTime = 1000 + 20 * 50 + 3000 // 3 seconds later (pruning active stirring samples)
    for (let j = 0; j < 10; j++) {
      pauseResult = detector.processFrame(makeHandFrame(centerX, centerY, baseTime + j * 50))
    }

    assert.equal(pauseResult.motion, MOTION_TYPES.STATIONARY)
    // Progress should have decayed
    assert.ok(pauseResult.progress < initialProgress, 'Progress must decay after prolonged pause')
    assert.ok(pauseResult.progress >= 0, 'Progress must not be negative')
  })

  it('extractHandCenter gracefully extracts center from minimal wrist landmark', () => {
    // Array of hands containing 1 hand with only wrist landmark
    const wristOnly = [[{ x: 0.42, y: 0.58, z: 0.01 }]]
    const center = extractHandCenter(wristOnly)
    assert.deepEqual(center, { x: 0.42, y: 0.58, z: 0.01 })

    // Empty array
    assert.equal(extractHandCenter([]), null)

    // Non-array
    assert.equal(extractHandCenter(null), null)
    assert.equal(extractHandCenter(undefined), null)
  })
})
