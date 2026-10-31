/**
 * useHandTracking — React Hook for AR-CookVision Computer Vision Foundation
 *
 * Connects HandLandmarkerManager and HandVisualizer to the CookingScreen.
 * Observes the MindAR video stream (WITHOUT opening a second camera stream)
 * and drives the 2D debug overlay canvas.
 *
 * High-frequency CV landmarks are sent directly to the canvas visualizer
 * to keep the React render tree fast and prevent AR frame stutter.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { HandLandmarkerManager } from '../cv/handLandmarkerManager.js'
import { HandVisualizer } from '../cv/handVisualizer.js'

export function useHandTracking({
  getVideoElement,
  containerRef,
  enabled = true,
  options = {},
  onHandResult,
}) {
  const [isDebugVisible, setIsDebugVisible] = useState(true)
  const isDebugVisibleRef = useRef(isDebugVisible)
  const enabledRef = useRef(enabled)
  const optionsRef = useRef(options)
  const onHandResultRef = useRef(onHandResult)
  const externalListenersRef = useRef(new Set())

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    isDebugVisibleRef.current = isDebugVisible
  }, [isDebugVisible])

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  useEffect(() => {
    onHandResultRef.current = onHandResult
  }, [onHandResult])

  const [cvStatus, setCvStatus] = useState({
    status: 'idle',
    detected: false,
    handCount: 0,
    fps: 0,
    inferenceTimeMs: 0,
    errorMessage: null,
  })

  const managerRef = useRef(null)
  const visualizerRef = useRef(null)
  const canvasRef = useRef(null)
  const isMountedRef = useRef(true)
  const lastDetectedRef = useRef(false)
  const videoPollIntervalRef = useRef(null)

  // 1. Initialize CV Manager & Visualizer
  useEffect(() => {
    isMountedRef.current = true

    const manager = new HandLandmarkerManager(optionsRef.current)
    const visualizer = new HandVisualizer()

    managerRef.current = manager
    visualizerRef.current = visualizer

    // Subscribe visualizer to high-frequency normalized hand results
    const unsubscribeListener = manager.addListener((result) => {
      if (!isMountedRef.current || !enabledRef.current) return

      // Direct canvas rendering (bypasses React reconciliation)
      if (canvasRef.current && visualizerRef.current) {
        const canvas = canvasRef.current
        visualizerRef.current.setCanvas(canvas)

        // Sync canvas dimensions with parent container if needed
        const rect = canvas.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          visualizerRef.current.resize(rect.width, rect.height)
        }

        if (isDebugVisibleRef.current) {
          visualizerRef.current.render(result)
        } else {
          visualizerRef.current.clear()
        }
      }

      // Notify external result callback if provided
      if (onHandResultRef.current) {
        try {
          onHandResultRef.current(result)
        } catch (err) {
          console.error('[useHandTracking] onHandResult callback error:', err)
        }
      }

      // Notify external subscribers (e.g. StirDetector)
      for (const listener of externalListenersRef.current) {
        try {
          listener(result)
        } catch (err) {
          console.error('[useHandTracking] External listener error:', err)
        }
      }

      // Update React state when detection changes immediately
      if (result.detected !== lastDetectedRef.current) {
        lastDetectedRef.current = result.detected
        setCvStatus((prev) => ({
          ...prev,
          detected: result.detected,
          handCount: result.handCount,
          status: result.status,
          fps: result.fps,
          inferenceTimeMs: result.inferenceTimeMs,
        }))
      }
    })

    const unsubscribeError = manager.onError((msg) => {
      if (!isMountedRef.current) return
      setCvStatus((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: msg,
      }))
    })

    // Poll CV diagnostic metrics every 500ms for UI displays
    const statsTimer = setInterval(() => {
      if (managerRef.current && isMountedRef.current) {
        const diag = managerRef.current.getDiagnostics()
        setCvStatus((prev) => ({
          ...prev,
          status: enabledRef.current ? diag.status : 'disabled',
          detected: enabledRef.current ? diag.detected : false,
          handCount: enabledRef.current ? diag.handCount : 0,
          fps: enabledRef.current ? diag.fps : 0,
          inferenceTimeMs: enabledRef.current ? diag.inferenceTimeMs : 0,
          errorMessage: diag.errorMessage,
        }))
      }
    }, 500)

    return () => {
      isMountedRef.current = false
      clearInterval(statsTimer)
      unsubscribeListener()
      unsubscribeError()

      if (managerRef.current) {
        managerRef.current.dispose()
        managerRef.current = null
      }
      if (visualizerRef.current) {
        visualizerRef.current.clear()
        visualizerRef.current = null
      }
    }
  }, []) // Mount once

  // 2. Video element attachment watcher and enabled state handler
  useEffect(() => {
    if (!enabled) {
      if (managerRef.current) {
        managerRef.current.pause()
      }
      if (visualizerRef.current) {
        visualizerRef.current.clear()
      }
      return
    }

    // When re-enabled, resume if manager already has an attached video element
    if (
      managerRef.current &&
      managerRef.current.videoElement &&
      (typeof document === 'undefined' || document.contains(managerRef.current.videoElement))
    ) {
      managerRef.current.resume()
      return
    }

    let isSubscribed = true

    const tryAttachVideo = () => {
      if (!isSubscribed || !managerRef.current) return false

      let video = null
      if (getVideoElement) {
        video = getVideoElement()
      }
      if (!video && containerRef?.current) {
        video = containerRef.current.querySelector('video')
      }

      if (video) {
        // Video element found! Start CV processing on it
        managerRef.current.start(video)
        return true
      }
      return false
    }

    // Try immediately
    if (!tryAttachVideo()) {
      // Poll until video element is created by MindAR
      videoPollIntervalRef.current = setInterval(() => {
        if (tryAttachVideo()) {
          clearInterval(videoPollIntervalRef.current)
          videoPollIntervalRef.current = null
        }
      }, 250)
    }

    return () => {
      isSubscribed = false
      if (videoPollIntervalRef.current) {
        clearInterval(videoPollIntervalRef.current)
        videoPollIntervalRef.current = null
      }
    }
  }, [enabled, getVideoElement, containerRef])

  // 3. Clear canvas immediately when debug is toggled off or disabled
  useEffect(() => {
    if ((!isDebugVisible || !enabled) && visualizerRef.current) {
      visualizerRef.current.clear()
    }
  }, [isDebugVisible, enabled])

  const toggleDebugVisualization = useCallback(() => {
    setIsDebugVisible((prev) => !prev)
  }, [])

  const getDiagnostics = useCallback(() => {
    if (!managerRef.current) return null
    const diag = managerRef.current.getDiagnostics()
    if (!enabledRef.current) {
      return {
        ...diag,
        status: 'disabled',
        detected: false,
        handCount: 0,
        fps: 0,
        inferenceTimeMs: 0,
      }
    }
    return diag
  }, [])

  const addHandResultListener = useCallback((callback) => {
    if (typeof callback === 'function') {
      externalListenersRef.current.add(callback)
      return () => {
        externalListenersRef.current.delete(callback)
      }
    }
    return () => {}
  }, [])

  const effectiveCvStatus = enabled
    ? cvStatus
    : {
        status: 'disabled',
        detected: false,
        handCount: 0,
        fps: 0,
        inferenceTimeMs: 0,
        errorMessage: null,
      }

  return {
    canvasRef,
    isDebugVisible,
    setIsDebugVisible,
    toggleDebugVisualization,
    cvStatus: effectiveCvStatus,
    getDiagnostics,
    addHandResultListener,
  }
}
