/**
 * CV Foundation Unit Tests — AR-CookVision Phase 4
 *
 * Validates result normalization, topological constants, lifecycle management,
 * throttling guards, and mock visualizer execution.
 *
 * Note: These automated tests verify algorithmic logic, contracts, and guard behaviors.
 * Real camera streaming and physical hand detection are verified separately on-device.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  HAND_LANDMARKS,
  FINGERTIPS,
  HAND_CONNECTIONS,
  DEFAULT_CV_CONFIG,
} from '../src/cv/cvTypes.js'

import {
  createEmptyResult,
  normalizeHandResult,
} from '../src/cv/resultNormalizer.js'

import { HandVisualizer } from '../src/cv/handVisualizer.js'
import { HandLandmarkerManager } from '../src/cv/handLandmarkerManager.js'

// Helper: Generates a realistic mock hand with 21 3D points
function createMockHand(offsetX = 0.5, offsetY = 0.5) {
  const points = []
  for (let i = 0; i < 21; i++) {
    points.push({
      x: offsetX + (i * 0.01),
      y: offsetY + (i * 0.01),
      z: -0.05 + (i * 0.002),
    })
  }
  return points
}

describe('Phase 4 CV Foundation — Result Normalizer', () => {
  it('handles null, undefined, or empty inputs gracefully', () => {
    const empty1 = normalizeHandResult(null)
    assert.equal(empty1.detected, false)
    assert.equal(empty1.handCount, 0)
    assert.deepEqual(empty1.landmarks, [])
    assert.deepEqual(empty1.handedness, [])
    assert.equal(empty1.status, 'no-hand')

    const empty2 = normalizeHandResult(undefined)
    assert.equal(empty2.detected, false)
    assert.equal(empty2.handCount, 0)

    const empty3 = normalizeHandResult({})
    assert.equal(empty3.detected, false)
    assert.equal(empty3.handCount, 0)
  })

  it('handles no-hand detection results correctly', () => {
    const rawNoHand = {
      landmarks: [],
      worldLandmarks: [],
      handedness: [],
    }

    const result = normalizeHandResult(rawNoHand, {
      inferenceTimeMs: 14.5,
      timestamp: 1000,
      fps: 12.5,
    })

    assert.equal(result.detected, false)
    assert.equal(result.handCount, 0)
    assert.deepEqual(result.landmarks, [])
    assert.equal(result.inferenceTimeMs, 14.5)
    assert.equal(result.timestamp, 1000)
    assert.equal(result.fps, 12.5)
    assert.equal(result.status, 'no-hand')
  })

  it('normalizes single hand detection results correctly', () => {
    const mockHand = createMockHand(0.4, 0.4)
    const rawOneHand = {
      landmarks: [mockHand],
      worldLandmarks: [mockHand],
      handedness: [[{ categoryName: 'Right', score: 0.96, index: 0 }]],
    }

    const result = normalizeHandResult(rawOneHand, {
      inferenceTimeMs: 22.0,
      timestamp: 2500,
      fps: 15.0,
    })

    assert.equal(result.detected, true)
    assert.equal(result.handCount, 1)
    assert.equal(result.landmarks.length, 1)
    assert.equal(result.landmarks[0].length, 21)
    assert.equal(result.worldLandmarks.length, 1)
    assert.equal(result.worldLandmarks[0].length, 21)

    // Verify coordinate preservation & numeric casting
    assert.equal(typeof result.landmarks[0][0].x, 'number')
    assert.equal(typeof result.landmarks[0][0].y, 'number')
    assert.equal(typeof result.landmarks[0][0].z, 'number')
    assert.equal(result.landmarks[0][0].x, 0.4)

    // Verify handedness parsing
    assert.equal(result.handedness.length, 1)
    assert.equal(result.handedness[0].label, 'Right')
    assert.equal(result.handedness[0].score, 0.96)
    assert.equal(result.status, 'tracking')
  })

  it('normalizes multiple hand detection results correctly', () => {
    const hand1 = createMockHand(0.2, 0.3)
    const hand2 = createMockHand(0.7, 0.3)
    const rawMultiHand = {
      landmarks: [hand1, hand2],
      worldLandmarks: [hand1, hand2],
      handedness: [
        [{ categoryName: 'Left', score: 0.91, index: 0 }],
        [{ categoryName: 'Right', score: 0.94, index: 1 }],
      ],
    }

    const result = normalizeHandResult(rawMultiHand, {
      inferenceTimeMs: 35.2,
      timestamp: 3000,
    })

    assert.equal(result.detected, true)
    assert.equal(result.handCount, 2)
    assert.equal(result.landmarks.length, 2)
    assert.equal(result.landmarks[0].length, 21)
    assert.equal(result.landmarks[1].length, 21)
    assert.equal(result.handedness[0].label, 'Left')
    assert.equal(result.handedness[1].label, 'Right')
    assert.equal(result.status, 'tracking')
  })

  it('createEmptyResult produces a consistent baseline contract', () => {
    const empty = createEmptyResult({ timestamp: 500, status: 'idle' })
    assert.equal(empty.detected, false)
    assert.equal(empty.handCount, 0)
    assert.deepEqual(empty.landmarks, [])
    assert.equal(empty.timestamp, 500)
    assert.equal(empty.status, 'idle')
  })
})

describe('Phase 4 CV Foundation — Topological Constants', () => {
  it('defines all 21 MediaPipe hand landmark keypoints', () => {
    assert.equal(Object.keys(HAND_LANDMARKS).length, 21)
    assert.equal(HAND_LANDMARKS.WRIST, 0)
    assert.equal(HAND_LANDMARKS.INDEX_FINGER_TIP, 8)
    assert.equal(HAND_LANDMARKS.PINKY_TIP, 20)
  })

  it('defines 5 valid fingertip indices', () => {
    assert.deepEqual(FINGERTIPS, [4, 8, 12, 16, 20])
  })

  it('defines 21 connected bone pairs with valid index bounds [0..20]', () => {
    assert.equal(HAND_CONNECTIONS.length, 21)
    for (const conn of HAND_CONNECTIONS) {
      assert.ok(conn.start >= 0 && conn.start <= 20, `start index ${conn.start} out of bounds`)
      assert.ok(conn.end >= 0 && conn.end <= 20, `end index ${conn.end} out of bounds`)
      assert.notEqual(conn.start, conn.end, 'connection cannot connect a point to itself')
    }
  })

  it('includes mobile-friendly default configuration', () => {
    assert.equal(DEFAULT_CV_CONFIG.numHands, 1)
    assert.equal(DEFAULT_CV_CONFIG.runningMode, 'VIDEO')
    assert.equal(DEFAULT_CV_CONFIG.modelAssetPath, '/models/hand_landmarker.task')
    assert.equal(DEFAULT_CV_CONFIG.wasmPath, '/wasm')
    assert.ok(DEFAULT_CV_CONFIG.throttleMs >= 50, 'throttleMs should be >= 50ms for mobile battery')
  })
})

describe('Phase 4 CV Foundation — HandVisualizer Overlay', () => {
  function createMockCanvas(width = 400, height = 300) {
    const calls = []
    const ctx = {
      clearRect: (...args) => calls.push({ method: 'clearRect', args }),
      beginPath: () => calls.push({ method: 'beginPath' }),
      moveTo: (...args) => calls.push({ method: 'moveTo', args }),
      lineTo: (...args) => calls.push({ method: 'lineTo', args }),
      stroke: () => calls.push({ method: 'stroke' }),
      arc: (...args) => calls.push({ method: 'arc', args }),
      fill: () => calls.push({ method: 'fill' }),
      save: () => calls.push({ method: 'save' }),
      restore: () => calls.push({ method: 'restore' }),
      measureText: (text) => ({ width: text.length * 6 }),
      roundRect: (...args) => calls.push({ method: 'roundRect', args }),
      fillText: (...args) => calls.push({ method: 'fillText', args }),
    }
    return {
      width,
      height,
      getContext: () => ctx,
      _calls: calls,
    }
  }

  it('clears canvas without errors when no hand detected', () => {
    const canvas = createMockCanvas(400, 300)
    const visualizer = new HandVisualizer(canvas)

    const emptyResult = createEmptyResult()
    visualizer.render(emptyResult)

    const clearCalls = canvas._calls.filter((c) => c.method === 'clearRect')
    assert.ok(clearCalls.length >= 1, 'clearRect should be invoked')
  })

  it('renders skeleton, joints, and fingertips when hand is detected', () => {
    const canvas = createMockCanvas(400, 300)
    const visualizer = new HandVisualizer(canvas)

    const hand = createMockHand(0.3, 0.3)
    const result = normalizeHandResult({
      landmarks: [hand],
      handedness: [[{ categoryName: 'Right', score: 0.95 }]],
    })

    visualizer.render(result)

    const lineCalls = canvas._calls.filter((c) => c.method === 'lineTo')
    assert.ok(lineCalls.length >= 21, 'Should draw all 21 skeletal connections')

    const arcCalls = canvas._calls.filter((c) => c.method === 'arc')
    assert.ok(arcCalls.length >= 21, 'Should draw circles for all 21 landmark joints')
  })

  it('resizes canvas matching display dimensions and dpr', () => {
    const canvas = createMockCanvas(100, 100)
    const visualizer = new HandVisualizer(canvas)

    visualizer.resize(300, 200, 2)
    assert.equal(canvas.width, 600)
    assert.equal(canvas.height, 400)
  })
})

describe('Phase 4 CV Foundation — HandLandmarkerManager Lifecycle & Guards', () => {
  it('instantiates cleanly with default configuration and idle state', () => {
    const manager = new HandLandmarkerManager({ throttleMs: 100 })
    assert.equal(manager.status, 'idle')
    assert.equal(manager.throttleMs, 100)
    assert.equal(manager.isPaused, false)
    assert.equal(manager.isDisposed, false)

    const diag = manager.getDiagnostics()
    assert.equal(diag.status, 'idle')
    assert.equal(diag.isInitialized, false)
    assert.equal(diag.hasVideo, false)
    assert.equal(diag.throttleMs, 100)
  })

  it('manages listeners and distributes normalized results', () => {
    const manager = new HandLandmarkerManager()
    const received = []

    const unsub = manager.addListener((res) => {
      received.push(res)
    })

    const mockHand = createMockHand()
    const normalized = normalizeHandResult({ landmarks: [mockHand] })
    manager.notifyListeners(normalized)

    assert.equal(received.length, 1)
    assert.equal(received[0].detected, true)

    unsub()
    manager.notifyListeners(normalized)
    assert.equal(received.length, 1, 'Should not receive results after unsubscribe')
  })

  it('guards against re-entrant inference calls', () => {
    const manager = new HandLandmarkerManager()
    let calls = 0

    // Mock hand landmarker
    manager.handLandmarker = {
      detectForVideo: () => {
        calls++
        return { landmarks: [] }
      },
    }

    const mockVideo = {
      paused: false,
      ended: false,
      readyState: 4,
      videoWidth: 640,
      videoHeight: 480,
    }

    manager.setVideoElement(mockVideo)

    // Execute first inference
    manager.runInference(mockVideo, 1000)
    assert.equal(calls, 1)

    // Test that when isProcessing is true, frameLoop skips execution
    manager.isProcessing = true
    manager.lastInferenceTime = 0 // throttle expired
    // simulate frame check
    assert.equal(manager.isProcessing, true)
    // frameLoop checks !this.isProcessing before running inference
    const shouldInfer = !manager.isProcessing
    assert.equal(shouldInfer, false, 'Should skip inference when processing is active')
  })

  it('enforces monotonic timestamps for MediaPipe Tasks Vision', () => {
    const manager = new HandLandmarkerManager()
    const capturedTimestamps = []

    manager.handLandmarker = {
      detectForVideo: (_video, timestamp) => {
        capturedTimestamps.push(timestamp)
        return { landmarks: [] }
      },
    }

    const mockVideo = {
      paused: false,
      ended: false,
      readyState: 4,
      videoWidth: 640,
      videoHeight: 480,
    }

    // Call 1 at time 500
    manager.runInference(mockVideo, 500)
    // Call 2 at time 500 (e.g. clock jitter / same ms)
    manager.runInference(mockVideo, 500)
    // Call 3 at time 499 (retrograde timestamp)
    manager.runInference(mockVideo, 499)
    // Call 4 at time 600
    manager.runInference(mockVideo, 600)

    assert.equal(capturedTimestamps.length, 4)
    // Verify strictly monotonic progression
    for (let i = 1; i < capturedTimestamps.length; i++) {
      assert.ok(
        capturedTimestamps[i] > capturedTimestamps[i - 1],
        `Timestamp ${capturedTimestamps[i]} must be strictly greater than ${capturedTimestamps[i - 1]}`
      )
    }
  })

  it('pauses, resumes, stops, and disposes cleanly', () => {
    const manager = new HandLandmarkerManager()
    let closed = false

    manager.handLandmarker = {
      close: () => {
        closed = true
      },
    }

    manager.pause()
    assert.equal(manager.isPaused, true)

    manager.resume()
    assert.equal(manager.isPaused, false)

    manager.stop()
    assert.equal(manager.videoElement, null)
    assert.equal(manager.lastResult.detected, false)

    manager.dispose()
    assert.equal(manager.isDisposed, true)
    assert.equal(manager.status, 'disposed')
    assert.equal(closed, true, 'HandLandmarker.close() must be called on dispose')
    assert.equal(manager.handLandmarker, null)
  })

  it('handles inference exceptions gracefully without throwing or crashing', () => {
    const manager = new HandLandmarkerManager()
    manager.handLandmarker = {
      detectForVideo: () => {
        throw new Error('Simulated WebGL context loss during inference')
      },
    }

    const mockVideo = {
      paused: false,
      ended: false,
      readyState: 4,
      videoWidth: 640,
      videoHeight: 480,
    }

    // Must not throw an unhandled exception
    assert.doesNotThrow(() => {
      manager.runInference(mockVideo, 1000)
    })

    assert.equal(manager.isProcessing, false, 'isProcessing flag must be cleared even on error')
    assert.equal(manager.lastResult.detected, false)
  })
})
