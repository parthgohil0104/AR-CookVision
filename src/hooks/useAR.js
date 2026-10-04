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

  const stopAR = useCallback(() => {
    if (arManagerRef.current) {
      arManagerRef.current.stop()
      arManagerRef.current = null
      setTrackingState('idle')
      setFps(0)
    }
  }, [])

  const startAR = useCallback(async () => {
    if (!containerRef.current) return

    // Clean up any existing session
    stopAR()
    setTrackingState('initializing')
    setErrorMessage('')

    const manager = new ARManager()
    arManagerRef.current = manager

    try {
      await manager.start({
        container: containerRef.current,
        imageTargetSrc: '/targets/targets.mind',
        onStateChange: (state) => {
          setTrackingState(state)
        },
        onError: (err) => {
          setTrackingState('error')
          setErrorMessage(err)
          if (onError) onError(err)
        },
        onFpsUpdate: (newFps) => {
          setFps(newFps)
        },
      })
    } catch (err) {
      console.warn('[useAR] ARManager start error handled:', err)
    }
  }, [containerRef, onError, stopAR])

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
      if (arManagerRef.current) {
        const diag = arManagerRef.current.getDiagnostics()
        setDiagnostics(diag)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let isSubscribed = true

    if (autoStart && containerRef.current) {
      startAR()
        .catch((err) => {
          console.warn('[useAR] startAR error handled:', err)
        })
        .then(() => {
          if (!isSubscribed) {
            stopAR()
          }
        })
    }

    return () => {
      isSubscribed = false
      stopAR()
    }
  }, [autoStart, containerRef, startAR, stopAR])

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
