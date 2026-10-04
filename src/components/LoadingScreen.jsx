import './LoadingScreen.css'

/**
 * LoadingScreen — Transition screen shown while initializing
 *
 * Phase 0: Animated visual only. No actual loading occurs.
 */
function LoadingScreen() {
  return (
    <div className="loading-screen" id="loading-screen">
      <div className="loading-screen__content fade-in">
        <div className="loading-screen__spinner">
          <div className="loading-screen__ring" />
          <div className="loading-screen__ring loading-screen__ring--inner" />
        </div>
        <p className="loading-screen__text">Preparing your kitchen…</p>
        <div className="loading-screen__bar-track">
          <div className="loading-screen__bar-fill" />
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen
