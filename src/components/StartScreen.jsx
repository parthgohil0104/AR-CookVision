import './StartScreen.css'

/**
 * StartScreen — Landing page for AR-CookVision
 *
 * Phase 0: Displays app branding, Start Cooking button, and safety message.
 * No camera or AR activation occurs here.
 */
function StartScreen({ onStart }) {
  return (
    <div className="start-screen" id="start-screen">
      {/* Ambient background effects */}
      <div className="start-screen__bg">
        <div className="start-screen__orb start-screen__orb--1" />
        <div className="start-screen__orb start-screen__orb--2" />
        <div className="start-screen__orb start-screen__orb--3" />
      </div>

      <div className="start-screen__content fade-in-up">
        {/* Logo / Brand */}
        <div className="start-screen__brand">
          <div className="start-screen__icon">
            <svg
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="start-screen__logo-svg"
              aria-hidden="true"
            >
              {/* Flame icon */}
              <path
                d="M32 4C32 4 18 20 18 36C18 44.837 24.163 52 32 52C39.837 52 46 44.837 46 36C46 20 32 4 32 4Z"
                fill="url(#flame-gradient)"
                stroke="rgba(255,107,53,0.4)"
                strokeWidth="1.5"
              />
              <path
                d="M32 22C32 22 25 30 25 38C25 42.418 28.134 46 32 46C35.866 46 39 42.418 39 38C39 30 32 22 32 22Z"
                fill="url(#flame-inner)"
              />
              {/* AR crosshair */}
              <circle cx="32" cy="36" r="6" stroke="#fff" strokeWidth="1.5" fill="none" opacity="0.7" />
              <line x1="32" y1="28" x2="32" y2="31" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
              <line x1="32" y1="41" x2="32" y2="44" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
              <line x1="24" y1="36" x2="27" y2="36" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
              <line x1="37" y1="36" x2="40" y2="36" stroke="#fff" strokeWidth="1.5" opacity="0.5" />
              <defs>
                <linearGradient id="flame-gradient" x1="32" y1="4" x2="32" y2="52" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#ff6b35" />
                  <stop offset="1" stopColor="#e05520" />
                </linearGradient>
                <linearGradient id="flame-inner" x1="32" y1="22" x2="32" y2="46" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#ffb347" />
                  <stop offset="1" stopColor="#ff6b35" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <h1 className="start-screen__title">
            AR-Cook<span className="start-screen__title-accent">Vision</span>
          </h1>

          <p className="start-screen__subtitle">Smart Cooking Assistant</p>
        </div>

        {/* CTA */}
        <button
          className="start-screen__cta"
          id="btn-start-cooking"
          onClick={onStart}
          type="button"
        >
          <span className="start-screen__cta-icon">🍳</span>
          <span>Start Cooking</span>
        </button>

        {/* Safety notice */}
        <div className="start-screen__safety glass" id="safety-notice">
          <div className="start-screen__safety-icon">⚠️</div>
          <p className="start-screen__safety-text">
            Keep the phone and AR marker away from flame, heat and oil splashes.
          </p>
        </div>

        {/* Version tag */}
        <p className="start-screen__version">Phase 0 — Foundation</p>
      </div>
    </div>
  )
}

export default StartScreen
