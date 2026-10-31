/**
 * Stir Detector Unit Tests — AR-CookVision Phase 5
 *
 * Validates the dedicated stir-motion detection subsystem:
 * 1. Empty/no-hand input
 * 2. Stationary hand
 * 3. Straight-line movement
 * 4. Random movement
 * 5. Valid circular/stir motion
 * 6. Incomplete circular motion
 * 7. Insufficient samples
 * 8. Tracking loss/reset
 * 9. Detector reset
 * 10. Threshold/confidence behavior
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  StirDetector,
  MOTION_TYPES,
  extractHandCenter,
  calculateMotionMetrics,
  normalizeAngleDelta,
  DEFAULT_STIR_CONFIG,
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

// Helper: generate empty/no-hand CVHandResult
function makeEmptyFrame(timestamp = 1000) {
  return {
    detected: false,
    handCount: 0,
    landmarks: [],
    worldLandmarks: [],
    handedness: [],
    timestamp,
    inferenceTimeMs: 0,
    fps: 0,
    status: 'no-hand',
  }
}

// Helper: generate circular trajectory frames
function generateCircleFrames({
  cx = 0.5,
  cy = 0.5,
  radius = 0.12,
  numFrames = 25,
  turns = 1.0,
  clockwise = false,
  startTimestamp = 1000,
  dt = 80,
}) {
  const frames = []
  const direction = clockwise ? -1 : 1
  for (let i = 0; i < numFrames; i++) {
    const fraction = i / (numFrames - 1)
    const angle = direction * fraction * (Math.PI * 2 * turns)
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    const timestamp = startTimestamp + i * dt
    frames.push(makeHandFrame(x, y, timestamp))
  }
  return frames
}

// Helper: generate straight-line trajectory frames
function generateLineFrames({
  x0 = 0.2,
  y0 = 0.5,
  x1 = 0.8,
  y1 = 0.5,
  numFrames = 25,
  startTimestamp = 1000,
  dt = 80,
}) {
  const frames = []
  for (let i = 0; i < numFrames; i++) {
    const fraction = i / (numFrames - 1)
    const x = x0 + fraction * (x1 - x0)
    const y = y0 + fraction * (y1 - y0)
    const timestamp = startTimestamp + i * dt
    frames.push(makeHandFrame(x, y, timestamp))
  }
  return frames
}

// Helper: generate random erratic frames using pseudo-random deterministic generator
function generateRandomFrames({
  cx = 0.5,
  cy = 0.5,
  numFrames = 25,
  startTimestamp = 1000,
  dt = 80,
}) {
  const frames = []
  // Deterministic LCG pseudo-random sequence
  let seed = 42
  function lcg() {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  for (let i = 0; i < numFrames; i++) {
    // Erratic jump in arbitrary directions
    const x = cx + (lcg() - 0.5) * 0.22
    const y = cy + (lcg() - 0.5) * 0.22
    const timestamp = startTimestamp + i * dt
    frames.push(makeHandFrame(x, y, timestamp))
  }
  return frames
}

describe('Phase 5 — StirDetector Unit Tests', () => {
  let detector

  beforeEach(() => {
    detector = new StirDetector()
  })

  // 1. Empty / no-hand input
  it('1. handles empty and no-hand inputs gracefully with NONE motion', () => {
    // Null input
    const res1 = detector.processFrame(null)
    assert.equal(res1.motion, MOTION_TYPES.NONE)
    assert.equal(res1.detected, false)
    assert.equal(res1.confidence, 0)
    assert.equal(res1.sampleCount, 0)

    // Empty result object
    const res2 = detector.processFrame(makeEmptyFrame(1000))
    assert.equal(res2.motion, MOTION_TYPES.NONE)
    assert.equal(res2.detected, false)
    assert.equal(res2.confidence, 0)

    // Hand with empty landmarks array
    const res3 = detector.processFrame({ detected: true, landmarks: [] })
    assert.equal(res3.motion, MOTION_TYPES.NONE)
    assert.equal(res3.detected, false)
  })

  // 2. Stationary hand
  it('2. detects STATIONARY motion when hand remains still', () => {
    // Feed 15 frames at nearly identical location (sub-millimeter sensor noise)
    let lastRes
    for (let i = 0; i < 15; i++) {
      const noise = (i % 2 === 0 ? 1 : -1) * 0.001
      const frame = makeHandFrame(0.5 + noise, 0.5 - noise, 1000 + i * 80)
      lastRes = detector.processFrame(frame)
    }

    assert.equal(lastRes.motion, MOTION_TYPES.STATIONARY)
    assert.equal(lastRes.detected, false)
    assert.equal(lastRes.progress, 0)
    assert.ok(lastRes.confidence > 0, 'Stationary confidence should be computed')
  })

  // 3. Straight-line movement
  it('3. detects LINEAR motion for straight-line movements and does not trigger stir', () => {
    // Horizontal swipe from x=0.2 to x=0.8
    const lineFrames = generateLineFrames({
      x0: 0.2,
      y0: 0.5,
      x1: 0.8,
      y1: 0.5,
      numFrames: 20,
    })

    let lastRes
    for (const frame of lineFrames) {
      lastRes = detector.processFrame(frame)
    }

    assert.equal(lastRes.motion, MOTION_TYPES.LINEAR)
    assert.equal(lastRes.detected, false)
    assert.equal(lastRes.progress, 0)
    assert.ok(lastRes.metrics.circularity < 0.22, 'Circularity of line should be very low')

    // Diagonal straight line test
    detector.reset()
    const diagFrames = generateLineFrames({
      x0: 0.2,
      y0: 0.2,
      x1: 0.8,
      y1: 0.8,
      numFrames: 20,
    })
    for (const frame of diagFrames) {
      lastRes = detector.processFrame(frame)
    }
    assert.equal(lastRes.motion, MOTION_TYPES.LINEAR)
    assert.equal(lastRes.detected, false)
  })

  // 4. Random movement
  it('4. distinguishes RANDOM erratic movement from circular stirring', () => {
    const randomFrames = generateRandomFrames({
      cx: 0.5,
      cy: 0.5,
      numFrames: 22,
    })

    let lastRes
    for (const frame of randomFrames) {
      lastRes = detector.processFrame(frame)
    }

    assert.equal(lastRes.motion, MOTION_TYPES.RANDOM)
    assert.equal(lastRes.detected, false)
    assert.equal(lastRes.progress, 0)
  })

  // 5. Valid circular/stir motion
  it('5. detects valid circular motion as STIR and accumulates progress to completion', () => {
    // Generate ~2 full counter-clockwise loops over 30 frames
    const circleFrames = generateCircleFrames({
      cx: 0.5,
      cy: 0.5,
      radius: 0.12,
      numFrames: 30,
      turns: 2.0,
      clockwise: false,
    })

    let lastRes
    let sawStir = false

    for (const frame of circleFrames) {
      lastRes = detector.processFrame(frame)
      if (lastRes.motion === MOTION_TYPES.STIR) {
        sawStir = true
      }
    }

    assert.ok(sawStir, 'Must classify motion as STIR during circular movement')
    assert.equal(lastRes.motion, MOTION_TYPES.STIR)
    assert.ok(lastRes.progress > 0.8, `Expected high progress, got ${lastRes.progress}`)
    assert.ok(lastRes.metrics.circularity >= 0.5, 'Circularity for circle should be high')
    assert.ok(
      lastRes.metrics.directionalConsistency >= 0.85,
      'Directional consistency should be high'
    )

    // Feed a few more circular frames to reach full 100% completion
    const extraFrames = generateCircleFrames({
      cx: 0.5,
      cy: 0.5,
      radius: 0.12,
      numFrames: 10,
      turns: 0.8,
      clockwise: false,
      startTimestamp: 1000 + 30 * 80,
    })

    for (const frame of extraFrames) {
      lastRes = detector.processFrame(frame)
    }

    assert.equal(lastRes.progress, 1.0)
    assert.equal(lastRes.detected, true)
    assert.equal(lastRes.isComplete, true)

    // Also test Clockwise stirring
    detector.reset()
    const cwFrames = generateCircleFrames({
      cx: 0.5,
      cy: 0.5,
      radius: 0.12,
      numFrames: 25,
      turns: 1.5,
      clockwise: true,
    })

    let sawCwStir = false
    for (const frame of cwFrames) {
      lastRes = detector.processFrame(frame)
      if (lastRes.motion === MOTION_TYPES.STIR) {
        sawCwStir = true
      }
    }
    assert.ok(sawCwStir, 'Clockwise stirring should also be detected as STIR')
  })

  // 6. Incomplete circular motion
  it('6. correctly tracks incomplete circular motion without falsely marking complete', () => {
    // Half loop only (turns = 0.45)
    const partialFrames = generateCircleFrames({
      cx: 0.5,
      cy: 0.5,
      radius: 0.12,
      numFrames: 14,
      turns: 0.45,
    })

    let lastRes
    for (const frame of partialFrames) {
      lastRes = detector.processFrame(frame)
    }

    // Partial rotation should not be 100% complete
    assert.equal(lastRes.detected, false)
    assert.equal(lastRes.isComplete, false)
    assert.ok(lastRes.progress < 0.6, `Progress should be partial, got ${lastRes.progress}`)
  })

  // 7. Insufficient samples
  it('7. reports STATIONARY and zero progress when sample count is below minSamples', () => {
    // Feed only 3 frames (minSamples is 8 by default)
    let res
    for (let i = 0; i < 3; i++) {
      res = detector.processFrame(makeHandFrame(0.5 + i * 0.05, 0.5, 1000 + i * 80))
    }

    assert.equal(res.sampleCount, 3)
    assert.equal(res.detected, false)
    assert.equal(res.progress, 0)
    assert.equal(res.motion, MOTION_TYPES.STATIONARY)
  })

  // 8. Tracking loss / reset
  it('8. handles temporary tracking loss and resets history upon prolonged loss', () => {
    // Stir for some frames to build partial progress
    const partialCircle = generateCircleFrames({
      cx: 0.5,
      cy: 0.5,
      radius: 0.12,
      numFrames: 18,
      turns: 1.0,
      startTimestamp: 1000,
    })

    let lastRes
    for (const frame of partialCircle) {
      lastRes = detector.processFrame(frame)
    }

    const savedProgress = lastRes.progress
    assert.ok(savedProgress > 0, 'Should have accumulated some progress')

    // Single frame drop (short glitch) at +80ms
    const dropped1 = detector.processFrame(makeEmptyFrame(1000 + 18 * 80))
    assert.equal(dropped1.motion, MOTION_TYPES.NONE)
    assert.equal(dropped1.detected, false)
    // Progress should not be instantly wiped out by a single frame drop
    assert.equal(dropped1.progress, savedProgress)

    // Temporary tracking loss shorter than trackingLossResetMs (< 2500ms) preserves history/progress
    const lastHandTime = 1000 + 17 * 80 // timestamp of last hand detection (2360ms)
    const tempLoss = detector.processFrame(makeEmptyFrame(lastHandTime + 2000))
    assert.equal(tempLoss.motion, MOTION_TYPES.NONE)
    assert.equal(tempLoss.detected, false)
    assert.equal(tempLoss.progress, savedProgress, 'Progress should be preserved during gap < trackingLossResetMs')
    assert.equal(tempLoss.sampleCount, 18, 'History buffer should be preserved during gap < trackingLossResetMs')

    // Prolonged tracking loss exceeding trackingLossResetMs (> 2500ms) resets history/progress
    const longLoss = detector.processFrame(makeEmptyFrame(lastHandTime + 2600))
    assert.equal(longLoss.motion, MOTION_TYPES.NONE)
    assert.equal(longLoss.detected, false)
    assert.equal(longLoss.progress, 0, 'Progress should reset after prolonged loss')
    assert.equal(longLoss.sampleCount, 0, 'History buffer should be cleared')
  })

  // 9. Detector reset
  it('9. cleanly resets state, history, and progress when reset() is invoked', () => {
    // Feed full stirring loop
    const circleFrames = generateCircleFrames({
      cx: 0.5,
      cy: 0.5,
      radius: 0.12,
      numFrames: 35,
      turns: 2.2,
    })

    for (const frame of circleFrames) {
      detector.processFrame(frame)
    }

    assert.ok(detector.progress > 0.8)

    // Reset detector
    const resetRes = detector.reset()

    assert.equal(resetRes.motion, MOTION_TYPES.NONE)
    assert.equal(resetRes.detected, false)
    assert.equal(resetRes.isComplete, false)
    assert.equal(resetRes.progress, 0)
    assert.equal(resetRes.confidence, 0)
    assert.equal(resetRes.sampleCount, 0)

    const status = detector.getStatus()
    assert.equal(status.progress, 0)
    assert.equal(status.sampleCount, 0)
  })

  // 10. Threshold and confidence behavior
  it('10. respects custom configuration options and confidence bounds [0.0 - 1.0]', () => {
    assert.ok(DEFAULT_STIR_CONFIG.windowDurationMs > 0)
    assert.ok(DEFAULT_STIR_CONFIG.targetStirAngle > 0)

    // Custom detector with higher minSamples and smaller target angle
    const customDetector = new StirDetector({
      minSamples: 10,
      targetStirAngle: Math.PI * 2.0, // Only 1 full loop required
      stationaryThreshold: 0.08,
    })

    // 5 frames should remain stationary due to minSamples = 10
    let res
    for (let i = 0; i < 5; i++) {
      res = customDetector.processFrame(makeHandFrame(0.5 + i * 0.01, 0.5, 1000 + i * 80))
    }
    assert.equal(res.sampleCount, 5)
    assert.equal(res.motion, MOTION_TYPES.STATIONARY)

    // Confidence is always bounded in [0.0, 1.0]
    const testCases = [
      makeEmptyFrame(2000),
      makeHandFrame(0.5, 0.5, 2080),
      makeHandFrame(0.8, 0.8, 2160),
    ]

    for (const tc of testCases) {
      const out = customDetector.processFrame(tc)
      assert.ok(out.confidence >= 0.0 && out.confidence <= 1.0, 'Confidence must be in [0, 1]')
      assert.ok(out.progress >= 0.0 && out.progress <= 1.0, 'Progress must be in [0, 1]')
    }
  })

  // Helper and utility tests
  it('extractHandCenter handles diverse landmark topologies and fallbacks', () => {
    assert.equal(extractHandCenter(null), null)
    assert.equal(extractHandCenter([]), null)
    assert.equal(extractHandCenter([[]]), null)

    // Partial hand with only wrist (1 landmark)
    const wristOnly = extractHandCenter([[{ x: 0.3, y: 0.4 }]])
    assert.deepEqual(wristOnly, { x: 0.3, y: 0.4, z: 0 })

    // Full 21-landmark hand: checks centroid of palm anchors 0, 5, 9, 17
    const fullHand = []
    for (let i = 0; i < 21; i++) {
      fullHand.push({ x: 0.1 * i, y: 0.2 * i, z: 0 })
    }
    const center = extractHandCenter([fullHand])
    // Expected x: (0 + 0.5 + 0.9 + 1.7) / 4 = 3.1 / 4 = 0.775
    // Expected y: (0 + 1.0 + 1.8 + 3.4) / 4 = 6.2 / 4 = 1.55
    assert.equal(center.x, 0.775)
    assert.equal(center.y, 1.55)
  })

  it('normalizeAngleDelta correctly normalizes across [-PI, PI]', () => {
    assert.equal(normalizeAngleDelta(0), 0)
    assert.ok(Math.abs(normalizeAngleDelta(Math.PI * 3) - Math.PI) < 1e-6)
    assert.ok(Math.abs(normalizeAngleDelta(-Math.PI * 3) - -Math.PI) < 1e-6)
  })

  it('calculateMotionMetrics returns valid metrics for empty or 1-sample input', () => {
    const emptyMetrics = calculateMotionMetrics([])
    assert.equal(emptyMetrics.sampleCount, 0)
    assert.equal(emptyMetrics.pathLength, 0)

    const singleMetrics = calculateMotionMetrics([{ x: 0.5, y: 0.5, timestamp: 1000 }])
    assert.equal(singleMetrics.sampleCount, 1)
    assert.equal(singleMetrics.circularity, 0)
  })
})
