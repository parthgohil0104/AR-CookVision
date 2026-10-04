import { useRef, useState } from 'react'
import { useAR } from '../hooks/useAR'
import './CookingScreen.css'

/**
 * CookingScreen — Interactive AR Cooking Interface
 *
 * Phase 1: AR Foundation
 * Activates real-time MindAR camera tracking, Three.js 3D scene,
 * holographic test cube, target reticle, and orientation feedback.
 */
function CookingScreen({ onBack, onError }) {
  const [showHelp, setShowHelp] = useState(false)
  const [showTools, setShowTools] = useState(false)

  const viewportRef = useRef(null)

  const {
    trackingState,
    fps,
    visualMode,
    colorTheme,
    isRotating,
    setVisualMode,
    setColorTheme,
    toggleRotation,
    stopAR,
  } = useAR({
    containerRef: viewportRef,
    onError,
    autoStart: true,
  })

  const currentStep = 1
  const totalSteps = 7

  const handleBack = () => {
    stopAR()
    onBack()
  }

  // Status mapping
  const getStatusDisplay = () => {
    switch (trackingState) {
      case 'initializing':
        return {
          className: 'status-init',
          label: 'Initializing AR...',
        }
      case 'searching':
        return {
          className: 'status-searching',
          label: 'Scanning for Marker',
        }
      case 'tracking':
        return {
          className: 'status-tracking',
          label: fps > 0 ? `Tracking (${fps} FPS)` : 'Marker Locked',
        }
      case 'error':
        return {
          className: 'status-error',
          label: 'AR Error',
        }
      case 'idle':
      default:
        return {
          className: 'status-idle',
          label: 'AR Standby',
        }
    }
  }

  const status = getStatusDisplay()

  return (
    <div className="cooking-screen" id="cooking-screen">
      {/* AR Viewport Container (MindAR video & Three.js canvas mount here) */}
      <div className="cooking-screen__viewport" id="ar-viewport" ref={viewportRef}>
        {/* Initializing Spinner */}
        {trackingState === 'initializing' && (
          <div className="cooking-screen__ar-loader fade-in">
            <div className="cooking-screen__ar-spinner" />
            <p className="cooking-screen__ar-loading-text">Starting Camera & AR Engine...</p>
            <span className="cooking-screen__ar-loading-sub">Loading tracking models</span>
          </div>
        )}

        {/* Scanning Reticle (active when searching for printed marker) */}
        {trackingState === 'searching' && (
          <div className="cooking-screen__reticle fade-in" id="ar-reticle">
            <div className="cooking-screen__reticle-frame">
              <span className="reticle-corner reticle-corner--tl" />
              <span className="reticle-corner reticle-corner--tr" />
              <span className="reticle-corner reticle-corner--bl" />
              <span className="reticle-corner reticle-corner--br" />
              <div className="reticle-laser" />
              <div className="reticle-crosshair" />
            </div>
            <div className="cooking-screen__reticle-guide">
              <span className="reticle-guide-icon">🎯</span>
              <span>Align camera with the printed AR marker</span>
            </div>
          </div>
        )}

        {/* Target Locked Confirmation Flash */}
        {trackingState === 'tracking' && (
          <div className="cooking-screen__locked-badge fade-in">
            <span className="locked-badge__icon">✓</span>
            <span className="locked-badge__text">ANCHOR LOCKED</span>
          </div>
        )}

        <div className="cooking-screen__scan-lines" />
      </div>

      {/* Top HUD Bar */}
      <div className="cooking-screen__hud-top glass">
        <button
          className="cooking-screen__back-btn"
          id="btn-back"
          onClick={handleBack}
          type="button"
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="cooking-screen__status" id="ar-status">
          <span className={`cooking-screen__status-dot ${status.className}`} />
          <span className="cooking-screen__status-label">{status.label}</span>
        </div>

        <div className="cooking-screen__step-indicator" id="step-indicator">
          Step {currentStep} / {totalSteps}
        </div>
      </div>

      {/* AR 3D Inspector / Tools Overlay Button */}
      <div className="cooking-screen__tools-toggle">
        <button
          className={`cooking-screen__tool-btn glass ${showTools ? 'active' : ''}`}
          id="btn-ar-tools"
          onClick={() => setShowTools(!showTools)}
          type="button"
          aria-label="Toggle AR 3D tools"
          title="AR 3D Inspector"
        >
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <span className="tool-btn-label">3D Tools</span>
        </button>
      </div>

      {/* Floating 3D Tools Drawer */}
      {showTools && (
        <div className="cooking-screen__tools-drawer glass fade-in" id="ar-tools-drawer">
          <div className="tools-drawer__header">
            <span className="tools-drawer__title">3D Anchor Inspector</span>
            <button
              type="button"
              className="tools-drawer__close"
              onClick={() => setShowTools(false)}
            >
              ✕
            </button>
          </div>

          <div className="tools-drawer__section">
            <span className="tools-drawer__label">Visual Mode:</span>
            <div className="tools-drawer__options">
              <button
                type="button"
                className={`tools-chip ${visualMode === 'cube' ? 'active' : ''}`}
                onClick={() => setVisualMode('cube')}
              >
                Cube
              </button>
              <button
                type="button"
                className={`tools-chip ${visualMode === 'stove-ring' ? 'active' : ''}`}
                onClick={() => setVisualMode('stove-ring')}
              >
                Stove Ring
              </button>
              <button
                type="button"
                className={`tools-chip ${visualMode === 'wireframe' ? 'active' : ''}`}
                onClick={() => setVisualMode('wireframe')}
              >
                Wireframe
              </button>
            </div>
          </div>

          <div className="tools-drawer__section">
            <span className="tools-drawer__label">Palette:</span>
            <div className="tools-drawer__options">
              <button
                type="button"
                className={`tools-chip ${colorTheme === 'kitchen-orange' ? 'active' : ''}`}
                onClick={() => setColorTheme('kitchen-orange')}
              >
                Flame
              </button>
              <button
                type="button"
                className={`tools-chip ${colorTheme === 'cyber-cyan' ? 'active' : ''}`}
                onClick={() => setColorTheme('cyber-cyan')}
              >
                Cyan
              </button>
              <button
                type="button"
                className={`tools-chip ${colorTheme === 'emerald-fresh' ? 'active' : ''}`}
                onClick={() => setColorTheme('emerald-fresh')}
              >
                Emerald
              </button>
            </div>
          </div>

          <div className="tools-drawer__section">
            <span className="tools-drawer__label">Motion:</span>
            <button
              type="button"
              className={`tools-chip ${isRotating ? 'active' : ''}`}
              onClick={toggleRotation}
            >
              {isRotating ? 'Rotation: ON' : 'Rotation: PAUSED'}
            </button>
          </div>
        </div>
      )}

      {/* Bottom HUD Panel */}
      <div className="cooking-screen__hud-bottom slide-up">
        <div className="cooking-screen__instruction-card glass gradient-border">
          <div className="cooking-screen__instruction-step">
            <span className="cooking-screen__instruction-badge">Step {currentStep} • AR Anchor</span>
          </div>
          <p className="cooking-screen__instruction-text" id="instruction-text">
            {trackingState === 'tracking'
              ? 'Marker locked! The 3D AR test cube is anchored to your cooking space.'
              : 'Point the camera toward the printed AR marker placed beside the stove.'}
          </p>
          <div className="cooking-screen__instruction-meta">
            <span className="cooking-screen__instruction-icon">
              {trackingState === 'tracking' ? '✨' : '📍'}
            </span>
            <span>
              {trackingState === 'tracking'
                ? 'Keep phone 30–60 cm from marker'
                : 'Searching for printed 8–10 cm marker'}
            </span>
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
            <span>Marker Guide</span>
          </button>
        </div>
      </div>

      {/* Help overlay */}
      {showHelp && (
        <div className="cooking-screen__help-overlay fade-in" id="help-overlay">
          <div className="cooking-screen__help-panel glass">
            <h2 className="cooking-screen__help-title">AR Marker Guide</h2>

            <div className="cooking-screen__help-marker-preview">
              <img
                src="/targets/marker.png"
                alt="AR Marker Reference"
                className="help-marker-img"
              />
              <span className="help-marker-caption">Target Marker (public/targets/marker.png)</span>
            </div>

            <ul className="cooking-screen__help-list">
              <li>Place the printed marker on a flat, dry surface beside the stove.</li>
              <li>Maintain a safe distance of 30 cm from open flames or oil splashes.</li>
              <li>Hold your phone 30–60 cm away with good kitchen lighting.</li>
              <li>Once detected, a glowing 3D test anchor appears directly over the marker.</li>
            </ul>

            <button
              className="cooking-screen__help-close"
              id="btn-help-close"
              onClick={() => setShowHelp(false)}
              type="button"
            >
              Resume Cooking
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CookingScreen
