import { useEffect, useRef, useState } from 'react'
import { useAR } from '../hooks/useAR'
import { useRecipe } from '../hooks/useRecipe'
import { useHandTracking } from '../hooks/useHandTracking'
import { useStirDetection } from '../hooks/useStirDetection'
import { RecipeHUD } from './hud/RecipeHUD'
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
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const viewportRef = useRef(null)

  const {
    trackingState,
    errorMessage,
    diagnostics,
    fps,
    visualMode,
    colorTheme,
    isRotating,
    setVisualMode,
    setColorTheme,
    toggleRotation,
    updateRecipeGuidance,
    startAR,
    stopAR,
    forcePlayVideo,
    getVideoElement,
  } = useAR({
    containerRef: viewportRef,
    onError,
    autoStart: true,
  })

  // Phase 4: Computer Vision Foundation — MediaPipe HandLandmarker
  const {
    canvasRef: cvCanvasRef,
    isDebugVisible: cvDebugVisible,
    toggleDebugVisualization: toggleCvDebug,
    cvStatus,
    addHandResultListener,
  } = useHandTracking({
    getVideoElement,
    containerRef: viewportRef,
    enabled: true,
  })

  const recipeEngine = useRecipe()

  // Phase 5: Automatic Stir-Motion Detection for Recipe Step 5
  const isStep5Active =
    recipeEngine.currentStepNumber === 5 && !recipeEngine.isCompleted

  const { stirState } = useStirDetection({
    isActive: isStep5Active,
    addHandResultListener,
    onStirComplete: () => {
      // Automatically complete Step 5 and advance to Step 6
      if (recipeEngine.currentStepNumber === 5 && !recipeEngine.isCompleted) {
        recipeEngine.completeStep(5)
        recipeEngine.nextStep()
      }
    },
    autoAdvanceDelayMs: 1500,
  })

  // Phase 3: Synchronize Recipe Engine state with 3D AR spatial guidance layer
  useEffect(() => {
    if (updateRecipeGuidance) {
      updateRecipeGuidance({
        stepNumber: recipeEngine.currentStepNumber,
        isCompleted: recipeEngine.isCompleted,
        timer: recipeEngine.timer,
      })
    }
  }, [
    recipeEngine.currentStepNumber,
    recipeEngine.isCompleted,
    recipeEngine.timer,
    updateRecipeGuidance,
  ])

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
          label: 'Camera Error',
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
      <div
        className="cooking-screen__viewport"
        id="ar-viewport"
        ref={viewportRef}
        onClick={() => {
          if (trackingState === 'idle') {
            startAR()
          } else {
            forcePlayVideo()
          }
        }}
        title="Tap to start or play camera"
      >
        {/* AR Standby Activation Card */}
        {trackingState === 'idle' && (
          <div className="cooking-screen__camera-error glass fade-in" id="ar-standby-panel">
            <div className="camera-error__icon">📷</div>
            <h3 className="camera-error__title">Camera Standby</h3>
            <p className="camera-error__msg">Tap below to activate camera and start AR tracking.</p>
            <div className="camera-error__actions">
              <button
                type="button"
                className="camera-error__btn camera-error__btn--primary"
                id="btn-start-camera"
                onClick={(e) => {
                  e.stopPropagation()
                  startAR()
                }}
              >
                ▶ Start Camera
              </button>
            </div>
          </div>
        )}

        {/* Initializing Spinner */}
        {trackingState === 'initializing' && (
          <div className="cooking-screen__ar-loader fade-in">
            <div className="cooking-screen__ar-spinner" />
            <p className="cooking-screen__ar-loading-text">Starting Camera & AR Engine...</p>
            <span className="cooking-screen__ar-loading-sub">Requesting camera access & loading models</span>
          </div>
        )}

        {/* Camera Error Recovery Card */}
        {trackingState === 'error' && (
          <div className="cooking-screen__camera-error glass fade-in" id="camera-error-panel">
            <div className="camera-error__icon">📷⚠️</div>
            <h3 className="camera-error__title">Camera Unavailable</h3>
            <p className="camera-error__msg">{errorMessage || 'Unable to access live camera stream.'}</p>
            <div className="camera-error__checklist">
              <span className="checklist-title">Please check:</span>
              <ul>
                <li>Camera permission is allowed in your browser</li>
                <li>HTTPS connection is accepted</li>
                <li>iOS Settings → Safari → Camera is set to Allow</li>
                <li>No other application is using the camera</li>
              </ul>
            </div>
            <div className="camera-error__actions">
              <button
                type="button"
                className="camera-error__btn camera-error__btn--primary"
                id="btn-camera-retry"
                onClick={(e) => {
                  e.stopPropagation()
                  startAR()
                }}
              >
                🔄 Retry Camera
              </button>
              <button
                type="button"
                className="camera-error__btn camera-error__btn--secondary"
                onClick={(e) => {
                  e.stopPropagation()
                  handleBack()
                }}
              >
                Return Home
              </button>
            </div>
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

        {/* Phase 4: MediaPipe HandLandmarker 2D Debug Overlay Canvas */}
        <canvas
          ref={cvCanvasRef}
          className={`cooking-screen__cv-canvas ${cvDebugVisible ? 'visible' : 'hidden'}`}
          id="cv-debug-canvas"
        />

        {/* Phase 4: CV Real-Time Hand Detection & Inference Status Badge */}
        {cvDebugVisible && (
          <div className="cooking-screen__cv-badge glass fade-in" id="cv-status-badge">
            <div className="cv-badge__status-line">
              <span
                className={`cv-badge__indicator ${
                  cvStatus.detected
                    ? 'detected'
                    : cvStatus.status === 'initializing'
                    ? 'init'
                    : cvStatus.status === 'error'
                    ? 'error'
                    : 'searching'
                }`}
              />
              <span className="cv-badge__title">
                {cvStatus.detected
                  ? `HAND DETECTED (${cvStatus.handCount})`
                  : cvStatus.status === 'initializing'
                  ? 'CV INITIALIZING...'
                  : cvStatus.status === 'error'
                  ? 'CV MODEL ERROR'
                  : 'NO HAND IN VIEW'}
              </span>
            </div>
            <div className="cv-badge__metrics">
              <span className="cv-badge__metric">
                <strong>{cvStatus.fps}</strong> FPS
              </span>
              <span className="cv-badge__sep">•</span>
              <span className="cv-badge__metric">
                <strong>{cvStatus.inferenceTimeMs}</strong> ms
              </span>
              {isStep5Active && (
                <>
                  <span className="cv-badge__sep">•</span>
                  <span className="cv-badge__metric" id="cv-stir-metric">
                    STIR: <strong>{stirState.motion}</strong> (
                    {Math.round(stirState.progress * 100)}%)
                  </span>
                </>
              )}
              <span className="cv-badge__sep">•</span>
              <span className="cv-badge__metric cv-badge__state">
                {cvStatus.status}
              </span>
            </div>
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
          Step {recipeEngine.currentStepNumber} / {recipeEngine.totalSteps}
        </div>
      </div>

      {/* AR Tools & Diagnostics Toggle Buttons */}
      <div className="cooking-screen__tools-toggle">
        <button
          className={`cooking-screen__tool-btn glass ${cvDebugVisible ? 'active' : ''}`}
          id="btn-cv-debug"
          onClick={toggleCvDebug}
          type="button"
          aria-label="Toggle Hand CV Debug Overlay"
          title="Hand CV Tracking"
        >
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="2">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.83L7 15" />
          </svg>
          <span className="tool-btn-label">Hand CV</span>
        </button>

        <button
          className={`cooking-screen__tool-btn glass ${showDiagnostics ? 'active' : ''}`}
          id="btn-diagnostics"
          onClick={() => {
            setShowDiagnostics(!showDiagnostics)
            setShowTools(false)
          }}
          type="button"
          aria-label="Toggle camera diagnostics"
          title="Camera Diagnostics"
        >
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span className="tool-btn-label">Cam Info</span>
        </button>

        <button
          className={`cooking-screen__tool-btn glass ${showTools ? 'active' : ''}`}
          id="btn-ar-tools"
          onClick={() => {
            setShowTools(!showTools)
            setShowDiagnostics(false)
          }}
          type="button"
          aria-label="Toggle AR 3D tools"
          title="AR 3D Inspector"
        >
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <span className="tool-btn-label">3D Tools</span>
        </button>
      </div>

      {/* Floating Diagnostics Drawer */}
      {showDiagnostics && (
        <div className="cooking-screen__diag-drawer glass fade-in" id="camera-diag-drawer">
          <div className="tools-drawer__header">
            <span className="tools-drawer__title">Camera Diagnostics</span>
            <button
              type="button"
              className="tools-drawer__close"
              onClick={() => setShowDiagnostics(false)}
            >
              ✕
            </button>
          </div>

          <div className="diag-drawer__list">
            <div className="diag-row">
              <span className="diag-label">Permission:</span>
              <span className={`diag-value diag-${diagnostics.permission}`}>{diagnostics.permission}</span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Stream:</span>
              <span className="diag-value">{diagnostics.streamActive ? `Active (${diagnostics.tracksCount} track)` : 'Inactive'}</span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Track State:</span>
              <span className="diag-value">{diagnostics.trackReadyState}</span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Video:</span>
              <span className={`diag-value ${diagnostics.videoPlaying ? 'diag-ok' : 'diag-warn'}`}>
                {diagnostics.videoExists ? (diagnostics.videoPlaying ? '▶ PLAYING' : '⏸ PAUSED') : 'Missing'}
              </span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Resolution:</span>
              <span className="diag-value">{diagnostics.videoWidth} × {diagnostics.videoHeight}</span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Video Layer:</span>
              <span className="diag-value">{diagnostics.videoZIndex} (Layer 1)</span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Canvas Layer:</span>
              <span className="diag-value">{diagnostics.canvasZIndex} (Layer 2)</span>
            </div>
            <div className="diag-row">
              <span className="diag-label">MindAR State:</span>
              <span className="diag-value">{diagnostics.trackingState} ({fps} FPS)</span>
            </div>
            <div className="diag-row">
              <span className="diag-label">AR Guidance:</span>
              <span className="diag-value">
                {diagnostics.isGuidanceCompleted
                  ? 'Completed (Celebration)'
                  : `Step ${diagnostics.activeGuidanceStep || recipeEngine.currentStepNumber} / 7`}
              </span>
            </div>
            <div className="diag-row diag-section-title">
              <span className="diag-label">Hand CV Tracking (Phase 4)</span>
            </div>
            <div className="diag-row">
              <span className="diag-label">CV Engine:</span>
              <span className={`diag-value ${cvStatus.status === 'error' ? 'diag-warn' : 'diag-ok'}`}>
                {cvStatus.status.toUpperCase()}
              </span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Hand Detected:</span>
              <span className={`diag-value ${cvStatus.detected ? 'diag-ok' : ''}`}>
                {cvStatus.detected ? `YES (${cvStatus.handCount} hand)` : 'NO'}
              </span>
            </div>
            <div className="diag-row">
              <span className="diag-label">CV Timing:</span>
              <span className="diag-value">
                {cvStatus.inferenceTimeMs} ms (~{cvStatus.fps} FPS)
              </span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Model Asset:</span>
              <span className="diag-value">/models/hand_landmarker.task</span>
            </div>
            {cvStatus.errorMessage && (
              <div className="diag-row">
                <span className="diag-label">CV Error:</span>
                <span className="diag-value diag-warn">{cvStatus.errorMessage}</span>
              </div>
            )}
            <div className="diag-row diag-section-title">
              <span className="diag-label">Stir Detection (Phase 5)</span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Step 5 Active:</span>
              <span className={`diag-value ${isStep5Active ? 'diag-ok' : ''}`}>
                {isStep5Active ? 'ACTIVE' : 'STANDBY'}
              </span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Motion Type:</span>
              <span className="diag-value">
                {stirState.motion}
              </span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Stir Progress:</span>
              <span className="diag-value">
                {Math.round(stirState.progress * 100)}% {stirState.isComplete ? '(Complete ✓)' : ''}
              </span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Confidence:</span>
              <span className="diag-value">
                {Math.round(stirState.confidence * 100)}%
              </span>
            </div>
            <div className="diag-row">
              <span className="diag-label">Buffered Samples:</span>
              <span className="diag-value">
                {stirState.sampleCount}
              </span>
            </div>
          </div>

          <div className="diag-drawer__actions">
            <button
              type="button"
              className="diag-action-btn"
              onClick={() => forcePlayVideo()}
            >
              ▶ Force Play Video
            </button>
            <button
              type="button"
              className="diag-action-btn"
              onClick={() => startAR()}
            >
              🔄 Restart Camera
            </button>
          </div>
        </div>
      )}

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
                className={`tools-chip ${visualMode === 'recipe-guide' ? 'active' : ''}`}
                onClick={() => setVisualMode('recipe-guide')}
              >
                Recipe Guide
              </button>
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

      {/* Bottom HUD Panel — Phase 2 Recipe Engine & Phase 5 Stir Detection */}
      <div className="cooking-screen__hud-bottom slide-up">
        <RecipeHUD
          recipeEngine={recipeEngine}
          onMarkerHelp={() => setShowHelp(true)}
          stirState={stirState}
          cvDebugVisible={cvDebugVisible}
        />
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
