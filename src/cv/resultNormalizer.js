/**
 * Result Normalizer for AR-CookVision Computer Vision Foundation
 *
 * Converts raw MediaPipe HandLandmarkerResult objects into a standardized,
 * engine-agnostic data contract. Isolates downstream systems (like Phase 5 stir detection)
 * from MediaPipe library changes, null checks, and internal representation quirks.
 */

/**
 * @typedef {Object} NormalizedPoint
 * @property {number} x - Normalized X coordinate [0.0 - 1.0]
 * @property {number} y - Normalized Y coordinate [0.0 - 1.0]
 * @property {number} z - Normalized Z coordinate (relative depth)
 */

/**
 * @typedef {Object} HandednessInfo
 * @property {string} label - 'Left' | 'Right' | 'Unknown'
 * @property {number} score - Confidence score [0.0 - 1.0]
 * @property {number} index - Hand index
 */

/**
 * @typedef {Object} CVHandResult
 * @property {boolean} detected - Whether at least one hand is detected
 * @property {number} handCount - Count of detected hands
 * @property {NormalizedPoint[][]} landmarks - 21 normalized landmarks per detected hand
 * @property {NormalizedPoint[][]} worldLandmarks - 3D world landmarks per detected hand (if available)
 * @property {HandednessInfo[]} handedness - Handedness metadata per hand
 * @property {number} timestamp - Monotonic frame timestamp in milliseconds
 * @property {number} inferenceTimeMs - Duration of inference in milliseconds
 * @property {number} fps - Approximate rolling inference FPS
 * @property {string} status - Processing status: 'no-hand' | 'tracking' | 'error' | 'ready' | 'idle'
 */

/**
 * Creates an empty, valid CVHandResult representing no detected hand.
 *
 * @param {Object} [meta={}]
 * @returns {CVHandResult}
 */
export function createEmptyResult(meta = {}) {
  const {
    timestamp = typeof performance !== 'undefined' ? performance.now() : Date.now(),
    inferenceTimeMs = 0,
    fps = 0,
    status = 'no-hand',
  } = meta

  return {
    detected: false,
    handCount: 0,
    landmarks: [],
    worldLandmarks: [],
    handedness: [],
    timestamp,
    inferenceTimeMs,
    fps,
    status,
  }
}

/**
 * Normalizes raw MediaPipe HandLandmarker output into a clean CVHandResult.
 *
 * @param {Object|null|undefined} rawResult - Output of HandLandmarker.detectForVideo()
 * @param {Object} [meta={}] - Execution metadata
 * @param {number} [meta.inferenceTimeMs=0]
 * @param {number} [meta.timestamp]
 * @param {number} [meta.fps=0]
 * @param {string} [meta.status='ready']
 * @returns {CVHandResult}
 */
export function normalizeHandResult(rawResult, meta = {}) {
  const {
    inferenceTimeMs = 0,
    timestamp = typeof performance !== 'undefined' ? performance.now() : Date.now(),
    fps = 0,
    status = 'ready',
  } = meta

  if (
    !rawResult ||
    !Array.isArray(rawResult.landmarks) ||
    rawResult.landmarks.length === 0
  ) {
    return createEmptyResult({
      timestamp,
      inferenceTimeMs,
      fps,
      status: status === 'error' ? 'error' : 'no-hand',
    })
  }

  const handCount = rawResult.landmarks.length

  // Normalize 21 2D/3D normalized landmarks
  const landmarks = rawResult.landmarks.map((hand) => {
    if (!Array.isArray(hand)) return []
    return hand.map((pt) => ({
      x: typeof pt?.x === 'number' ? Number(pt.x) : 0,
      y: typeof pt?.y === 'number' ? Number(pt.y) : 0,
      z: typeof pt?.z === 'number' ? Number(pt.z) : 0,
    }))
  })

  // Normalize world coordinates if provided
  const worldLandmarks = Array.isArray(rawResult.worldLandmarks)
    ? rawResult.worldLandmarks.map((hand) => {
        if (!Array.isArray(hand)) return []
        return hand.map((pt) => ({
          x: typeof pt?.x === 'number' ? Number(pt.x) : 0,
          y: typeof pt?.y === 'number' ? Number(pt.y) : 0,
          z: typeof pt?.z === 'number' ? Number(pt.z) : 0,
        }))
      })
    : []

  // Extract handedness (MediaPipe provides either rawResult.handedness or rawResult.handednesses)
  const rawHandedness = rawResult.handedness || rawResult.handednesses || []
  const handedness = rawHandedness.map((list) => {
    const item = Array.isArray(list) ? list[0] : list
    if (!item) return { label: 'Unknown', score: 0, index: 0 }
    return {
      label: item.categoryName || item.displayName || item.label || 'Unknown',
      score: typeof item.score === 'number' ? Number(item.score) : 0,
      index: typeof item.index === 'number' ? Number(item.index) : 0,
    }
  })

  return {
    detected: handCount > 0,
    handCount,
    landmarks,
    worldLandmarks,
    handedness,
    timestamp,
    inferenceTimeMs,
    fps,
    status: handCount > 0 ? 'tracking' : 'no-hand',
  }
}
