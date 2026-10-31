/**
 * CV Types & Constants for AR-CookVision
 *
 * Defines MediaPipe Hand Landmark topological indices,
 * skeletal connection pairs, and mobile-friendly default configurations.
 */

/**
 * 21 Standard MediaPipe Hand Landmark Indices
 */
export const HAND_LANDMARKS = Object.freeze({
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_FINGER_MCP: 5,
  INDEX_FINGER_PIP: 6,
  INDEX_FINGER_DIP: 7,
  INDEX_FINGER_TIP: 8,
  MIDDLE_FINGER_MCP: 9,
  MIDDLE_FINGER_PIP: 10,
  MIDDLE_FINGER_DIP: 11,
  MIDDLE_FINGER_TIP: 12,
  RING_FINGER_MCP: 13,
  RING_FINGER_PIP: 14,
  RING_FINGER_DIP: 15,
  RING_FINGER_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
})

/**
 * Key landmark indices for quick access in cooking analysis
 */
export const FINGERTIPS = Object.freeze([
  HAND_LANDMARKS.THUMB_TIP,
  HAND_LANDMARKS.INDEX_FINGER_TIP,
  HAND_LANDMARKS.MIDDLE_FINGER_TIP,
  HAND_LANDMARKS.RING_FINGER_TIP,
  HAND_LANDMARKS.PINKY_TIP,
])

/**
 * 21 Hand Skeletal Connections (pairs of landmark indices)
 */
export const HAND_CONNECTIONS = Object.freeze([
  // Palm Base / Thumb
  { start: 0, end: 1 },
  { start: 1, end: 2 },
  { start: 2, end: 3 },
  { start: 3, end: 4 },
  // Index Finger
  { start: 0, end: 5 },
  { start: 5, end: 6 },
  { start: 6, end: 7 },
  { start: 7, end: 8 },
  // Middle Finger
  { start: 5, end: 9 },
  { start: 9, end: 10 },
  { start: 10, end: 11 },
  { start: 11, end: 12 },
  // Ring Finger
  { start: 9, end: 13 },
  { start: 13, end: 14 },
  { start: 14, end: 15 },
  { start: 15, end: 16 },
  // Pinky
  { start: 13, end: 17 },
  { start: 0, end: 17 },
  { start: 17, end: 18 },
  { start: 18, end: 19 },
  { start: 19, end: 20 },
])

/**
 * Mobile-friendly HandLandmarker Configuration
 * Optimized for real-time cooking assistant on iOS / Android browsers.
 */
export const DEFAULT_CV_CONFIG = Object.freeze({
  wasmPath: '/wasm',
  modelAssetPath: '/models/hand_landmarker.task',
  numHands: 1, // Single hand focus for mobile cooking tasks
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  runningMode: 'VIDEO',
  delegate: 'GPU', // Automatically falls back to CPU if WebGL fails
  throttleMs: 80, // ~12.5 FPS — balances low latency and battery/AR render smoothness
})
