/**
 * useStirDetection — React Hook for AR-CookVision Phase 5
 *
 * Connects the StirDetector subsystem to Recipe Step 5.
 * Subscribes to normalized CVHandResult frames when Step 5 is active.
 *
 * Provides reactive stir progress, motion classification, user feedback text,
 * and handles automatic Step 5 completion with configurable feedback delay.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { StirDetector, MOTION_TYPES } from '../cv/stirDetector'

const IDLE_STIR_STATE = Object.freeze({
  isActive: false,
  detected: false,
  confidence: 0,
  motion: MOTION_TYPES.NONE,
  progress: 0,
  sampleCount: 0,
  isComplete: false,
  statusText: 'Waiting for hand...',
  metrics: null,
})

export function useStirDetection({
  isActive = false,
  addHandResultListener,
  onStirComplete,
  autoAdvanceDelayMs = 1500,
  detectorOptions = {},
}) {
  const [liveStirState, setLiveStirState] = useState({
    ...IDLE_STIR_STATE,
    isActive: true,
  })

  const detectorRef = useRef(null)
  const isActiveRef = useRef(isActive)
  const isCompletedRef = useRef(false)
  const onStirCompleteRef = useRef(onStirComplete)
  const detectorOptionsRef = useRef(detectorOptions)
  const autoAdvanceTimerRef = useRef(null)
  const lastStateUpdateRef = useRef(0)

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  useEffect(() => {
    onStirCompleteRef.current = onStirComplete
  }, [onStirComplete])

  useEffect(() => {
    detectorOptionsRef.current = detectorOptions
  }, [detectorOptions])

  // Initialize StirDetector in effect lifecycle
  useEffect(() => {
    const detector = new StirDetector(detectorOptionsRef.current)
    detectorRef.current = detector

    return () => {
      detector.reset()
      detectorRef.current = null
    }
  }, [])

  // Handle active step transitions (Step 4 -> Step 5 -> Step 6 / Reset)
  useEffect(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }

    isCompletedRef.current = false
    if (detectorRef.current) {
      detectorRef.current.reset()
    }

    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current)
        autoAdvanceTimerRef.current = null
      }
    }
  }, [isActive])

  // Subscribe to normalized CV hand tracking results
  useEffect(() => {
    if (!addHandResultListener) return

    const handleHandResult = (cvResult) => {
      if (!isActiveRef.current || isCompletedRef.current) return
      if (!detectorRef.current) return

      const result = detectorRef.current.processFrame(cvResult)

      // Derive human-readable HUD feedback text
      let statusText = 'Waiting for hand...'
      if (result.isComplete) {
        statusText = 'Stir complete ✓'
      } else if (result.motion === MOTION_TYPES.STIR) {
        statusText = 'Stirring detected...'
      } else if (result.motion === MOTION_TYPES.STATIONARY) {
        statusText = 'Hand detected — start stirring'
      } else if (result.motion === MOTION_TYPES.LINEAR) {
        statusText = 'Move in circular motions (not straight lines)'
      } else if (result.motion === MOTION_TYPES.RANDOM) {
        statusText = 'Keep a continuous circular rhythm...'
      } else {
        statusText = 'Waiting for hand...'
      }

      // Check for completion trigger
      if (result.isComplete && !isCompletedRef.current) {
        isCompletedRef.current = true

        setLiveStirState({
          isActive: true,
          detected: true,
          confidence: result.confidence,
          motion: MOTION_TYPES.STIR,
          progress: 1.0,
          sampleCount: result.sampleCount,
          isComplete: true,
          statusText: 'Stir complete ✓',
          metrics: result.metrics,
        })

        // Trigger automatic completion after user feedback delay
        if (autoAdvanceTimerRef.current) {
          clearTimeout(autoAdvanceTimerRef.current)
        }
        autoAdvanceTimerRef.current = setTimeout(() => {
          if (isActiveRef.current && onStirCompleteRef.current) {
            onStirCompleteRef.current()
          }
        }, autoAdvanceDelayMs)

        return
      }

      // Throttle React state updates to ~75ms to avoid UI jank
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (now - lastStateUpdateRef.current > 75) {
        lastStateUpdateRef.current = now
        setLiveStirState({
          isActive: true,
          detected: result.detected,
          confidence: result.confidence,
          motion: result.motion,
          progress: result.progress,
          sampleCount: result.sampleCount,
          isComplete: result.isComplete,
          statusText,
          metrics: result.metrics,
        })
      }
    }

    const unsubscribe = addHandResultListener(handleHandResult)
    return () => {
      unsubscribe()
    }
  }, [addHandResultListener, autoAdvanceDelayMs])

  const resetStirDetection = useCallback(() => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current)
      autoAdvanceTimerRef.current = null
    }
    isCompletedRef.current = false
    if (detectorRef.current) {
      detectorRef.current.reset()
    }
    setLiveStirState({
      ...IDLE_STIR_STATE,
      isActive: isActiveRef.current,
    })
  }, [])

  // When not active (e.g. on other recipe steps), return IDLE_STIR_STATE
  const stirState = isActive ? liveStirState : IDLE_STIR_STATE

  return {
    stirState,
    resetStirDetection,
  }
}
