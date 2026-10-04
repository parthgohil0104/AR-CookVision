import { useState } from 'react'
import './CookingScreen.css'

/**
 * CookingScreen — Placeholder cooking interface
 *
 * Phase 0: Visual shell only.
 * Displays camera placeholder, AR status, step indicator, and help toggle.
 * No camera or AR is activated.
 */
function CookingScreen({ onBack, _onError }) {
  const [showHelp, setShowHelp] = useState(false)

  const currentStep = 1
  const totalSteps = 7

  return (
    <div className="cooking-screen" id="cooking-screen">
      {/* Camera / AR Placeholder */}
      <div className="cooking-screen__viewport" id="ar-viewport">
        <div className="cooking-screen__viewport-placeholder">
          <div className="cooking-screen__viewport-icon">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
              <rect x="4" y="8" width="40" height="28" rx="4" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
              <circle cx="24" cy="22" r="8" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.5" />
              <circle cx="24" cy="22" r="3" fill="currentColor" opacity="0.3" />
              <rect x="12" y="38" width="24" height="4" rx="2" fill="currentColor" opacity="0.15" />
            </svg>
          </div>
          <p className="cooking-screen__viewport-text">Camera will activate in Phase 1</p>
          <div className="cooking-screen__scan-lines" />
        </div>
      </div>

      {/* Top HUD Bar */}
      <div className="cooking-screen__hud-top glass">
        <button
          className="cooking-screen__back-btn"
          id="btn-back"
          onClick={onBack}
          type="button"
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="cooking-screen__status" id="ar-status">
          <span className="cooking-screen__status-dot" />
          <span className="cooking-screen__status-label">AR Ready</span>
        </div>

        <div className="cooking-screen__step-indicator" id="step-indicator">
          Step {currentStep} / {totalSteps}
        </div>
      </div>

      {/* Bottom HUD Panel */}
      <div className="cooking-screen__hud-bottom slide-up">
        <div className="cooking-screen__instruction-card glass gradient-border">
          <div className="cooking-screen__instruction-step">
            <span className="cooking-screen__instruction-badge">Step {currentStep}</span>
          </div>
          <p className="cooking-screen__instruction-text" id="instruction-text">
            Point the camera toward the AR anchor beside the stove.
          </p>
          <div className="cooking-screen__instruction-meta">
            <span className="cooking-screen__instruction-icon">📍</span>
            <span>Look for the printed marker</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="cooking-screen__actions">
          <button
            className="cooking-screen__help-btn glass"
            id="btn-help"
            onClick={() => setShowHelp(!showHelp)}
            type="button"
          >
            <span className="cooking-screen__help-icon">?</span>
            <span>Help</span>
          </button>
        </div>
      </div>

      {/* Help overlay */}
      {showHelp && (
        <div className="cooking-screen__help-overlay fade-in" id="help-overlay">
          <div className="cooking-screen__help-panel glass">
            <h2 className="cooking-screen__help-title">How to use</h2>
            <ul className="cooking-screen__help-list">
              <li>Place the printed AR marker on a flat, dry surface beside your stove.</li>
              <li>Keep the marker at least 30 cm from any flame or heat source.</li>
              <li>Point your phone camera at the marker to begin tracking.</li>
              <li>Follow the on-screen AR instructions for each cooking step.</li>
              <li>Keep the marker visible and avoid covering it with steam or splashes.</li>
            </ul>
            <button
              className="cooking-screen__help-close"
              id="btn-help-close"
              onClick={() => setShowHelp(false)}
              type="button"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CookingScreen
