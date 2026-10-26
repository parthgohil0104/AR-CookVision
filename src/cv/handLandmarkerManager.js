/**
 * HandLandmarkerManager — AR-CookVision Computer Vision Subsystem
 *
 * Manages MediaPipe Tasks Vision HandLandmarker lifecycle, throttled video frame processing,
 * GPU/CPU delegate fallbacks, and event distribution.
 *
 * Single camera ownership rule: This manager NEVER accesses navigator.mediaDevices or getUserMedia().
 * It consumes video frames exclusively from the existing video element owned by MindAR.
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { DEFAULT_CV_CONFIG } from './cvTypes.js'
import { createEmptyResult, normalizeHandResult } from './resultNormalizer.js'

export class HandLandmarkerManager {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.wasmPath] - Path to WASM binaries (default: '/wasm')
   * @param {string} [options.modelAssetPath] - Relative path to .task model (default: '/models/hand_landmarker.task')
   * @param {number} [options.numHands] - Max hands to detect (default: 1)
   * @param {number} [options.minHandDetectionConfidence] - Min detection confidence (default: 0.5)
   * @param {number} [options.minHandPresenceConfidence] - Min presence confidence (default: 0.5)
   * @param {number} [options.minTrackingConfidence] - Min tracking confidence (default: 0.5)
   * @param {string} [options.runningMode] - 'VIDEO' | 'IMAGE' (default: 'VIDEO')
   * @param {string} [options.delegate] - 'GPU' | 'CPU' (default: 'GPU')
   * @param {number} [options.throttleMs] - Min interval between inferences in ms (default: 80ms)
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_CV_CONFIG, ...options }

    // Subsystem state
    this.status = 'idle' // 'idle' | 'initializing' | 'ready' | 'tracking' | 'no-hand' | 'error' | 'disposed'
    this.handLandmarker = null
    this.videoElement = null
    this.isPaused = false
    this.isProcessing = false
    this.isDisposed = false
    this.activeDelegate = this.config.delegate
    this.errorMessage = null

    // Timing and throttling
    this.throttleMs = this.config.throttleMs
    this.lastInferenceTime = 0
    this.lastVideoTimestamp = 0
    this.rafId = null

    // Rolling FPS computation
    this.fps = 0
    this.frameCount = 0
    this.fpsWindowStart = typeof performance !== 'undefined' ? performance.now() : Date.now()

    // Results & subscribers
    this.lastResult = createEmptyResult()
    this.listeners = new Set()
    this.errorListeners = new Set()

    // Bound frame loop
    this.loopBound = this.frameLoop.bind(this)
  }

  /**
   * Initializes the MediaPipe FilesetResolver and HandLandmarker instance.
   * Gracefully falls back from GPU to CPU delegate if WebGL fails.
   *
   * @returns {Promise<boolean>} Success status
   */
  async init() {
    if (this.isDisposed) {
      console.warn('[HandLandmarkerManager] Cannot init disposed manager')
      return false
    }

    if (this.handLandmarker) {
      return true
    }

    if (this.status === 'initializing') {
      // Already initializing, wait for completion
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.status !== 'initializing') {
            clearInterval(check)
            resolve(this.status === 'ready')
          }
        }, 50)
      })
    }

    this.status = 'initializing'
    this.errorMessage = null

    try {
      // 1. Resolve WASM fileset from local project assets with CDN fallback
      let visionFileset
      try {
        visionFileset = await FilesetResolver.forVisionTasks(this.config.wasmPath)
      } catch (wasmErr) {
        console.warn(
          `[HandLandmarkerManager] Failed to load local WASM from ${this.config.wasmPath}. Retrying via CDN fallback...`,
          wasmErr
        )
        visionFileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        )
      }

      // 2. Create HandLandmarker with GPU delegate first
      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(visionFileset, {
          baseOptions: {
            modelAssetPath: this.config.modelAssetPath,
            delegate: this.config.delegate,
          },
          runningMode: this.config.runningMode,
          numHands: this.config.numHands,
          minHandDetectionConfidence: this.config.minHandDetectionConfidence,
          minHandPresenceConfidence: this.config.minHandPresenceConfidence,
          minTrackingConfidence: this.config.minTrackingConfidence,
        })
        this.activeDelegate = this.config.delegate
      } catch (gpuErr) {
        if (this.config.delegate === 'GPU') {
          console.warn(
            '[HandLandmarkerManager] GPU delegate creation failed. Falling back to CPU delegate...',
            gpuErr
          )
          // Fallback to CPU delegate
          this.handLandmarker = await HandLandmarker.createFromOptions(visionFileset, {
            baseOptions: {
              modelAssetPath: this.config.modelAssetPath,
              delegate: 'CPU',
            },
            runningMode: this.config.runningMode,
            numHands: this.config.numHands,
            minHandDetectionConfidence: this.config.minHandDetectionConfidence,
            minHandPresenceConfidence: this.config.minHandPresenceConfidence,
            minTrackingConfidence: this.config.minTrackingConfidence,
          })
          this.activeDelegate = 'CPU'
        } else {
          throw gpuErr
        }
      }

      this.status = 'ready'
      console.log(`[HandLandmarkerManager] HandLandmarker initialized successfully (${this.activeDelegate})`)
      return true
    } catch (err) {
      const msg = err?.message || 'HandLandmarker initialization failed'
      console.error('[HandLandmarkerManager] Initialization error:', err)
      this.status = 'error'
      this.errorMessage = msg
      this.notifyError(msg)
      return false
    }
  }

  /**
   * Starts HandLandmarker processing on the provided video element.
   *
   * @param {HTMLVideoElement} videoElement - Video element owned by MindAR
   * @returns {Promise<boolean>}
   */
  async start(videoElement) {
    if (this.isDisposed) {
      console.warn('[HandLandmarkerManager] Cannot start disposed manager')
      return false
    }

    if (videoElement) {
      this.videoElement = videoElement
    }

    this.isPaused = false

    if (!this.handLandmarker) {
      const ok = await this.init()
      if (!ok) return false
    }

    this.startLoop()
    return true
  }

  /**
   * Sets or updates the video element to process.
   *
   * @param {HTMLVideoElement|null} videoElement
   */
  setVideoElement(videoElement) {
    this.videoElement = videoElement
  }

  /**
   * Internal animation/inference loop driven by requestAnimationFrame.
   */
  startLoop() {
    if (this.rafId !== null) return
    if (typeof window === 'undefined' || !window.requestAnimationFrame) return

    const schedule = () => {
      this.rafId = window.requestAnimationFrame(this.loopBound)
    }
    schedule()
  }

  stopLoop() {
    if (this.rafId !== null && typeof window !== 'undefined' && window.cancelAnimationFrame) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  /**
   * Frame execution tick. Evaluates video readiness and throttle limits before calling inference.
   */
  frameLoop() {
    this.rafId = null
    if (this.isDisposed || this.isPaused) return

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()

    // 1. Check video element readiness
    const video = this.videoElement
    const isVideoReady =
      video &&
      !video.paused &&
      !video.ended &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0

    // 2. Evaluate throttling interval
    const elapsed = now - this.lastInferenceTime
    const shouldInfer = isVideoReady && this.handLandmarker && elapsed >= this.throttleMs && !this.isProcessing

    if (shouldInfer) {
      this.runInference(video, now)
    }

    // Schedule next frame check
    if (!this.isDisposed && !this.isPaused && typeof window !== 'undefined') {
      this.rafId = window.requestAnimationFrame(this.loopBound)
    }
  }

  /**
   * Executes a single inference step with guarded error handling and timing metrics.
   *
   * @param {HTMLVideoElement} video
   * @param {number} now
   */
  runInference(video, now) {
    if (this.isDisposed || this.isPaused || !this.handLandmarker) return

    this.isProcessing = true
    this.lastInferenceTime = now

    // Ensure monotonically increasing timestamp for MediaPipe Tasks Vision
    const frameTimestamp = Math.max(now, this.lastVideoTimestamp + 1)
    this.lastVideoTimestamp = frameTimestamp

    let rawResult = null
    let inferenceTimeMs = 0

    try {
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
      rawResult = this.handLandmarker.detectForVideo(video, frameTimestamp)
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
      inferenceTimeMs = Math.round((t1 - t0) * 10) / 10
    } catch (inferErr) {
      console.warn('[HandLandmarkerManager] Inference warning:', inferErr?.message || inferErr)
      // Do not crash the application or AR stream on a transient inference fault
    } finally {
      this.isProcessing = false
    }

    // Update rolling FPS
    this.updateFps(now)

    // Normalize output into clean CVHandResult
    const normalized = normalizeHandResult(rawResult, {
      inferenceTimeMs,
      timestamp: frameTimestamp,
      fps: this.fps,
      status: this.status,
    })

    this.lastResult = normalized
    this.status = normalized.detected ? 'tracking' : 'no-hand'

    // Notify subscribers
    this.notifyListeners(normalized)
  }

  /**
   * Updates rolling inference FPS over 1-second sliding windows.
   *
   * @param {number} now
   */
  updateFps(now) {
    this.frameCount++
    const windowElapsed = now - this.fpsWindowStart
    if (windowElapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / windowElapsed * 10) / 10
      this.frameCount = 0
      this.fpsWindowStart = now
    }
  }

  /**
   * Pauses the inference loop.
   */
  pause() {
    this.isPaused = true
    this.stopLoop()
  }

  /**
   * Resumes inference loop if video is active.
   */
  resume() {
    if (this.isDisposed) return
    this.isPaused = false
    this.startLoop()
  }

  /**
   * Halts inference loop and clears video element.
   */
  stop() {
    this.pause()
    this.videoElement = null
    this.lastResult = createEmptyResult()
    this.notifyListeners(this.lastResult)
  }

  /**
   * Completely disposes HandLandmarker resources, cancels loops, and clears listeners.
   */
  dispose() {
    this.isDisposed = true
    this.stop()

    if (this.handLandmarker) {
      try {
        if (typeof this.handLandmarker.close === 'function') {
          this.handLandmarker.close()
        }
      } catch (closeErr) {
        console.warn('[HandLandmarkerManager] Error closing HandLandmarker:', closeErr)
      }
      this.handLandmarker = null
    }

    this.status = 'disposed'
    this.listeners.clear()
    this.errorListeners.clear()
  }

  /**
   * Updates the throttle interval dynamically (e.g., adapt on low-power devices).
   *
   * @param {number} ms
   */
  setThrottleMs(ms) {
    this.throttleMs = Math.max(16, Number(ms) || 80)
  }

  /**
   * Subscribes a listener callback to high-frequency normalized hand results.
   *
   * @param {Function} callback - (result: CVHandResult) => void
   * @returns {Function} Unsubscribe function
   */
  addListener(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback)
    }
    return () => this.removeListener(callback)
  }

  /**
   * Unsubscribes a listener callback.
   *
   * @param {Function} callback
   */
  removeListener(callback) {
    this.listeners.delete(callback)
  }

  /**
   * Subscribes to initialization or runtime error notifications.
   *
   * @param {Function} callback - (errorMessage: string) => void
   * @returns {Function} Unsubscribe function
   */
  onError(callback) {
    if (typeof callback === 'function') {
      this.errorListeners.add(callback)
    }
    return () => this.errorListeners.delete(callback)
  }

  notifyListeners(result) {
    for (const listener of this.listeners) {
      try {
        listener(result)
      } catch (err) {
        console.error('[HandLandmarkerManager] Listener callback error:', err)
      }
    }
  }

  notifyError(msg) {
    for (const listener of this.errorListeners) {
      try {
        listener(msg)
      } catch (err) {
        console.error('[HandLandmarkerManager] Error listener callback error:', err)
      }
    }
  }

  /**
   * Diagnostic summary of current CV subsystem state.
   */
  getDiagnostics() {
    const video = this.videoElement
    return {
      status: this.status,
      isInitialized: !!this.handLandmarker,
      isPaused: this.isPaused,
      hasVideo: !!video,
      videoReadyState: video ? video.readyState : 0,
      videoDimensions: video ? `${video.videoWidth}x${video.videoHeight}` : 'none',
      throttleMs: this.throttleMs,
      fps: this.fps,
      inferenceTimeMs: this.lastResult.inferenceTimeMs,
      detected: this.lastResult.detected,
      handCount: this.lastResult.handCount,
      delegate: this.activeDelegate,
      modelPath: this.config.modelAssetPath,
      errorMessage: this.errorMessage,
    }
  }
}
