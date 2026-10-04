import { useState } from 'react'
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

  const handleStartCooking = () => {
    setScreen('loading')

    // Simulate a brief loading phase before showing cooking screen
    setTimeout(() => {
      setScreen('cooking')
    }, 1800)
  }

  const handleError = (message) => {
    setErrorMessage(message)
    setScreen('error')
  }

  const handleRetry = () => {
    setScreen('start')
    setErrorMessage('')
  }

  const handleBack = () => {
    setScreen('start')
  }

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
