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
  const [fps, setFps] = useState(0)
  const [visualMode, setVisualModeState] = useState('cube')
  const [colorTheme, setColorThemeState] = useState('kitchen-orange')
  const [isRotating, setIsRotatingState] = useState(true)

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
    fps,
    visualMode,
    colorTheme,
    isRotating,
    startAR,
    stopAR,
    setVisualMode,
    setColorTheme,
    toggleRotation,
  }
}
