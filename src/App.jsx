import { useCallback, useState } from 'react'
import StartScreen from './components/StartScreen'
import CookingScreen from './components/CookingScreen'
import LoadingScreen from './components/LoadingScreen'
import ErrorScreen from './components/ErrorScreen'
import './App.css'

/**
 * App – Root component for AR-CookVision
 *
 * Phase 0: Visual shell only.
 * Screens: start → loading → cooking | error
 */
function App() {
  // 'start' | 'loading' | 'cooking' | 'error'
  const [screen, setScreen] = useState('start')
  const [errorMessage, setErrorMessage] = useState('')

  // Transition immediately to preserve user gesture context for iOS Safari getUserMedia & autoplay!
  const handleStartCooking = useCallback(() => {
    setScreen('cooking')
  }, [])

  const handleError = useCallback((message) => {
    setErrorMessage(message)
    setScreen('error')
  }, [])

  const handleRetry = useCallback(() => {
    setScreen('start')
    setErrorMessage('')
  }, [])

  const handleBack = useCallback(() => {
    setScreen('start')
  }, [])

  return (
    <div className="app" id="app-root">
      {screen === 'start' && (
        <StartScreen onStart={handleStartCooking} />
      )}
      {screen === 'loading' && (
        <LoadingScreen />
      )}
      {screen === 'cooking' && (
        <CookingScreen onBack={handleBack} onError={handleError} />
      )}
      {screen === 'error' && (
        <ErrorScreen message={errorMessage} onRetry={handleRetry} />
      )}
    </div>
  )
}

export default App
