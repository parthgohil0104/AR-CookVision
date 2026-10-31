import './ErrorScreen.css'

/**
 * ErrorScreen — Shown when an error occurs
 *
 * Phase 0: Visual shell with retry functionality.
 */
function ErrorScreen({ message, onRetry }) {
  return (
    <div className="error-screen" id="error-screen">
      <div className="error-screen__content fade-in-up">
        <div className="error-screen__icon">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
            <circle cx="24" cy="24" r="20" stroke="var(--color-danger)" strokeWidth="2" fill="none" opacity="0.3" />
            <path d="M24 14v12" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="24" cy="32" r="1.5" fill="var(--color-danger)" />
          </svg>
        </div>

        <h2 className="error-screen__title">Something went wrong</h2>

        <p className="error-screen__message">
          {message || 'An unexpected error occurred. Please try again.'}
        </p>

        <button
          className="error-screen__retry-btn"
          id="btn-retry"
          onClick={onRetry}
          type="button"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}

export default ErrorScreen
