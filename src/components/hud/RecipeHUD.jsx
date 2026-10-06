import './RecipeHUD.css'

/**
 * RecipeHUD Component
 *
 * Displays the interactive 7-step cooking interface:
 * - Step number & progress bar
 * - Step title, action tag, and instruction
 * - Chef tip callout
 * - Interactive countdown timer (when step has timerSeconds)
 * - Navigation buttons: Back, Next / Finish, Mark Done, Restart
 * - Full recipe completion overlay
 */
export function RecipeHUD({ recipeEngine, onMarkerHelp }) {
  const {
    steps,
    totalSteps,
    currentStepIndex,
    currentStepNumber,
    currentStep,
    completedSteps,
    progress,
    timer,
    formattedTime,
    isCompleted,
    isFirstStep,
    isLastStep,
    hasTimer,
    nextStep,
    prevStep,
    completeStep,
    startTimer,
    pauseTimer,
    resetTimer,
    resetRecipe,
    goToStep,
  } = recipeEngine

  const isCurrentStepDone = completedSteps.includes(currentStepNumber)

  return (
    <div className="recipe-hud" id="recipe-hud">
      {/* Step Progress Bar & Quick Step Pills */}
      <div className="recipe-hud__progress-container">
        <div className="recipe-hud__progress-info">
          <span className="recipe-hud__step-count">
            Step {currentStepNumber} of {totalSteps}
          </span>
          <span className="recipe-hud__progress-pct">{progress}% Completed</span>
        </div>

        <div className="recipe-hud__progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="recipe-hud__progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 7-Step Step Tracker Pills */}
        <div className="recipe-hud__step-pills" id="step-pills">
          {steps.map((step, idx) => {
            const stepNum = idx + 1
            const isDone = completedSteps.includes(stepNum)
            const isCurrent = idx === currentStepIndex

            let pillClass = 'step-pill'
            if (isCurrent) pillClass += ' step-pill--active'
            if (isDone) pillClass += ' step-pill--done'

            return (
              <button
                key={step.id || idx}
                type="button"
                className={pillClass}
                onClick={() => goToStep(idx)}
                aria-label={`Go to step ${stepNum}: ${step.title}`}
                title={`Step ${stepNum}: ${step.title}`}
              >
                {isDone ? (
                  <span className="step-pill__check">✓</span>
                ) : (
                  <span className="step-pill__num">{stepNum}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Step Instruction Card */}
      <div className="recipe-hud__card glass gradient-border">
        {/* Step Header */}
        <div className="recipe-hud__card-header">
          <div className="recipe-hud__title-group">
            <span className="recipe-hud__step-icon">{currentStep?.icon || '🍳'}</span>
            <div className="recipe-hud__titles">
              <h2 className="recipe-hud__title" id="step-title">
                {currentStep?.title}
              </h2>
              {currentStep?.requiredAction && (
                <span className="recipe-hud__action-badge">
                  {currentStep.requiredAction}
                </span>
              )}
            </div>
          </div>

          {/* Quick Step Status Tag */}
          <button
            type="button"
            className={`recipe-hud__done-badge ${isCurrentStepDone ? 'is-done' : ''}`}
            onClick={() => completeStep(currentStepNumber)}
            title={isCurrentStepDone ? 'Step completed' : 'Mark step as done'}
            aria-label="Toggle step completion"
          >
            {isCurrentStepDone ? '✓ Completed' : '○ Mark Done'}
          </button>
        </div>

        {/* Instruction Body */}
        <p className="recipe-hud__instruction" id="step-instruction">
          {currentStep?.instruction}
        </p>

        {/* Chef Tip Callout */}
        {currentStep?.tip && (
          <div className="recipe-hud__tip">
            <span className="recipe-hud__tip-icon">💡</span>
            <span className="recipe-hud__tip-text">
              <strong>Chef Tip:</strong> {currentStep.tip}
            </span>
          </div>
        )}

        {/* Interactive Timer (when applicable) */}
        {hasTimer && (
          <div
            className={`recipe-hud__timer-module ${
              timer.isRunning ? 'is-running' : ''
            } ${timer.isFinished ? 'is-finished' : ''}`}
            id="step-timer-module"
          >
            <div className="timer-module__header">
              <span className="timer-module__label">
                {timer.isFinished ? '🔔 Timer Completed!' : '⏱️ Step Timer'}
              </span>
              <span className="timer-module__display" id="timer-display">
                {formattedTime}
              </span>
            </div>

            <div className="timer-module__controls">
              {!timer.isRunning ? (
                <button
                  type="button"
                  className="timer-btn timer-btn--start"
                  id="btn-timer-start"
                  onClick={startTimer}
                  disabled={timer.remaining <= 0}
                >
                  ▶ {timer.remaining < timer.duration ? 'Resume' : 'Start Timer'}
                </button>
              ) : (
                <button
                  type="button"
                  className="timer-btn timer-btn--pause"
                  id="btn-timer-pause"
                  onClick={pauseTimer}
                >
                  ⏸ Pause
                </button>
              )}

              <button
                type="button"
                className="timer-btn timer-btn--reset"
                id="btn-timer-reset"
                onClick={resetTimer}
                title="Reset timer to start"
              >
                ↺ Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Primary Navigation Controls */}
      <div className="recipe-hud__controls">
        <button
          type="button"
          className="recipe-ctrl-btn recipe-ctrl-btn--secondary"
          id="btn-step-back"
          onClick={prevStep}
          disabled={isFirstStep}
          aria-label="Previous step"
        >
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back</span>
        </button>

        <button
          type="button"
          className="recipe-ctrl-btn recipe-ctrl-btn--ghost"
          id="btn-recipe-reset"
          onClick={resetRecipe}
          aria-label="Restart recipe"
          title="Restart from Step 1"
        >
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>Restart</span>
        </button>

        {onMarkerHelp && (
          <button
            type="button"
            className="recipe-ctrl-btn recipe-ctrl-btn--ghost"
            id="btn-marker-guide"
            onClick={onMarkerHelp}
            aria-label="Open marker guide"
            title="Marker Guide"
          >
            <span style={{ fontSize: '14px' }}>🎯</span>
            <span>Guide</span>
          </button>
        )}

        <button
          type="button"
          className="recipe-ctrl-btn recipe-ctrl-btn--primary"
          id="btn-step-next"
          onClick={nextStep}
          aria-label={isLastStep ? 'Complete recipe' : 'Next step'}
        >
          <span>{isLastStep ? 'Finish Omelette 🎉' : 'Next Step'}</span>
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Recipe Completion Modal / Overlay */}
      {isCompleted && (
        <div className="recipe-completion-overlay fade-in" id="recipe-completed-modal">
          <div className="recipe-completion-card glass gradient-border">
            <div className="recipe-completion__hero">
              <span className="recipe-completion__badge">🍳 BON APPÉTIT</span>
              <h2 className="recipe-completion__title">Omelette Complete!</h2>
              <p className="recipe-completion__desc">
                Congratulations! You’ve successfully prepared a delicate, golden French omelette following all 7 guided culinary steps.
              </p>
            </div>

            <div className="recipe-completion__summary">
              <div className="summary-item">
                <span className="summary-item__label">Steps Finished</span>
                <span className="summary-item__val">7 / 7 (100%)</span>
              </div>
              <div className="summary-item">
                <span className="summary-item__label">Estimated Time</span>
                <span className="summary-item__val">~7 mins</span>
              </div>
              <div className="summary-item">
                <span className="summary-item__label">Status</span>
                <span className="summary-item__val val-ready">Plated & Ready</span>
              </div>
            </div>

            <div className="recipe-completion__actions">
              <button
                type="button"
                className="completion-btn completion-btn--primary"
                id="btn-cook-again"
                onClick={resetRecipe}
              >
                🔄 Cook Again
              </button>
              <button
                type="button"
                className="completion-btn completion-btn--secondary"
                id="btn-review-steps"
                onClick={() => goToStep(0)}
              >
                📋 Review Steps
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RecipeHUD
