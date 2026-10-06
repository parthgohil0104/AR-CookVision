import { useCallback, useEffect, useRef, useState } from 'react'
import { ARManager } from '../ar/arManager'

/**
 * useAR
 *
 * Custom React hook managing AR lifecycle, tracking state,
 * and 3D visual controls for AR-CookVision.
 */
export function useAR({ containerRef, onError, autoStart = true }) {
  const [trackingState, setTrackingState] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [fps, setFps] = useState(0)
  const [visualMode, setVisualModeState] = useState('cube')
  const [colorTheme, setColorThemeState] = useState('kitchen-orange')
  const [isRotating, setIsRotatingState] = useState(true)
  const [diagnostics, setDiagnostics] = useState({
    permission: 'unknown',
    streamActive: false,
    tracksCount: 0,
    videoExists: false,
    videoPlaying: false,
    videoReadyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    videoZIndex: 'none',
    canvasZIndex: 'none',
    trackingState: 'idle',
    fps: 0,
    errorMessage: null,
  })

  const arManagerRef = useRef(null)
  const isMountedRef = useRef(true)
  const startPromiseRef = useRef(null)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const stopAR = useCallback(() => {
    console.trace('[useAR] stopAR was called! Call stack:')
    if (arManagerRef.current) {
      arManagerRef.current.stop()
      arManagerRef.current = null
    }
    startPromiseRef.current = null
    if (isMountedRef.current) {
      setTrackingState('idle')
      setFps(0)
    }
  }, [])

  const startAR = useCallback(async () => {
    if (!containerRef.current) return
    if (!isMountedRef.current) return

    // If already active, avoid duplicate instance
    if (arManagerRef.current && arManagerRef.current.isStarted) {
      console.log('[useAR] Already started')
      return
    }

    // Clean up any previous stopped instance
    if (arManagerRef.current) {
      arManagerRef.current.stop()
      arManagerRef.current = null
    }

    setTrackingState('initializing')
    setErrorMessage('')

    const manager = new ARManager()
    arManagerRef.current = manager

    const p = manager.start({
      container: containerRef.current,
      imageTargetSrc: '/targets/targets.mind',
      onStateChange: (state) => {
        if (isMountedRef.current) {
          setTrackingState(state)
        }
      },
      onError: (err) => {
        if (isMountedRef.current) {
          setTrackingState('error')
          setErrorMessage(err)
          if (onErrorRef.current) onErrorRef.current(err)
        }
      },
      onFpsUpdate: (newFps) => {
        if (isMountedRef.current) {
          setFps(newFps)
        }
      },
    })
    startPromiseRef.current = p

    try {
      await p
    } catch (err) {
      console.warn('[useAR] ARManager start error handled:', err)
    } finally {
      if (startPromiseRef.current === p) {
        startPromiseRef.current = null
      }
    }
  }, [containerRef])

  const forcePlayVideo = useCallback(() => {
    if (arManagerRef.current) {
      return arManagerRef.current.forcePlayVideo()
    }
    return Promise.resolve(false)
  }, [])

  const setVisualMode = useCallback((mode) => {
    setVisualModeState(mode)
    if (arManagerRef.current) {
      arManagerRef.current.setVisualMode(mode)
    }
  }, [])

  const setColorTheme = useCallback((theme) => {
    setColorThemeState(theme)
    if (arManagerRef.current) {
      arManagerRef.current.setColorTheme(theme)
    }
  }, [])

  const toggleRotation = useCallback(() => {
    if (arManagerRef.current) {
      const active = arManagerRef.current.toggleRotation()
      setIsRotatingState(active)
    }
  }, [])

  // Poll camera diagnostics every 500ms
  useEffect(() => {
    const timer = setInterval(() => {
      if (arManagerRef.current && isMountedRef.current) {
        const diag = arManagerRef.current.getDiagnostics()
        setDiagnostics(diag)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [])

  // Lifecycle control: single start on mount without premature cleanup cancellation
  useEffect(() => {
    isMountedRef.current = true

    if (autoStart && containerRef.current && !arManagerRef.current) {
      startAR()
    }

    return () => {
      isMountedRef.current = false
      if (arManagerRef.current) {
        arManagerRef.current.stop()
        arManagerRef.current = null
      }
    }
  }, [autoStart, containerRef, startAR])

  return {
    trackingState,
    errorMessage,
    diagnostics,
    fps,
    visualMode,
    colorTheme,
    isRotating,
    startAR,
    stopAR,
    forcePlayVideo,
    setVisualMode,
    setColorTheme,
    toggleRotation,
  }
}
