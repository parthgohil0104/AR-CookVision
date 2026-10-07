# Phase 5 Report — Stir-Motion Detection

## 1. Objective

Implement automatic stirring-motion detection for **Step 5 (Stir)** of the French Omelette recipe in AR-CookVision using the MediaPipe HandLandmarker computer-vision foundation created in Phase 4.

Key objectives:
1. **Physical Hand Gesture Detection**: Detect physical circular/rotational stirring motion performed by the user's hand in front of the camera.
2. **Automatic Step 5 Completion**: Upon successful circular stirring detection (accumulating required rotational progress), automatically mark Step 5 as completed and smoothly transition to Step 6.
3. **Manual Fallback Guarantee**: Preserve manual controls (`Next Step`, `Mark Done`, `Back`, `Restart`, timer controls) at all times so the user is never blocked by lighting, camera angle, or CV tracking conditions.
4. **Preserve Single Camera Stream Ownership**: MindAR remains the sole owner of the camera stream. No secondary `getUserMedia()` or duplicate streams.
5. **Decoupled Architecture**: Stir detection is implemented as a standalone, framework-agnostic detector consuming normalized `CVHandResult` objects produced by Phase 4.
6. **Scoped Execution**: Stir detection activates **only** when recipe Step 5 is active and cleanly rests on all other steps.

---

## 2. Implementation Overview

### Files Created & Modified

| File | Type | Description |
|---|---|---|
| `src/cv/stirDetector.js` | New Source | Pure ES module implementing `StirDetector`, PCA circularity analysis, angular progression, 5-state motion classification (`NONE`, `STATIONARY`, `LINEAR`, `RANDOM`, `STIR`), sliding window history buffer, and progressive completion. |
| `src/cv/index.js` | Modified | Exported `StirDetector`, `MOTION_TYPES`, `DEFAULT_STIR_CONFIG`, and geometric motion analysis helpers from the CV subsystem. |
| `src/hooks/useHandTracking.js` | Modified | Added `addHandResultListener` registration and callback forwarding so downstream consumers (like stir detection) can subscribe to high-frequency normalized `CVHandResult` frames without re-rendering the view layer. |
| `src/hooks/useStirDetection.js` | New Hook | React hook connecting `StirDetector` to Recipe Step 5. Manages Step 5 lifecycle transitions (entry, exit, resets), throttles React state updates, formats human-readable status text, and manages automatic completion with feedback delay. |
| `src/components/hud/RecipeHUD.jsx` | Modified | Integrated Step 5 Automatic Stir Detection module: pulse indicator, title, mode badge ("Automatic detection: ON"), progress bar, status text, percentage readout, and debug metrics. |
| `src/components/hud/RecipeHUD.css` | Modified | Glassmorphic HUD styling with cyber-cyan/neon-mint progress bars, pulsating live dot, celebration green completion glow, and monospace debug pills. |
| `src/components/CookingScreen.jsx` | Modified | Wired `useStirDetection` to Step 5 lifecycle and `RecipeHUD`, added live stir metrics to the top CV status badge and the Camera Diagnostics drawer. |
| `tests/stir-detector.test.js` | New Tests | 13 automated unit tests covering all 10 Phase 5 test criteria (empty input, stationary hand, straight lines, random walk, circular stir, partial stir, insufficient samples, tracking loss, resets, confidence bounds). |
| `scripts/test-phase5-stir.mjs` | New Script | Headless Chrome CDP integration test validating DOM mounting, Step 1-4 exclusion, Step 5 activation, drawer metrics, step transition cleanup (Step 5 → Step 6 → Step 5), and manual fallback. |
| `docs/phase-5-report.md` | New Doc | Comprehensive Phase 5 architectural documentation, algorithm specification, test results, and device verification guide. |

---

## 3. Stir Detection Algorithm

The detector evaluates hand trajectories over time rather than instantaneous hand presence.

```
Normalized CVHandResult
         │
         ▼
Extract Stable Hand Centroid (Palm: Landmarks 0, 5, 9, 17)
         │
         ▼
Sliding Window History Buffer (Bounded by time: 2800ms & count: 60)
         │
         ▼
Sample Count Check (< 8 samples ➔ STATIONARY / Initializing)
         │
         ▼
Compute Geometric & Angular Trajectory Metrics
├── 1. Path Length (L) & Net Displacement (D)
├── 2. 2D Covariance Matrix & Eigenvalues (λ₁, λ₂)
├── 3. Circularity Ratio = √(λ₂ / λ₁)
├── 4. Centroid Radius Mean (r̄) & Coefficient of Variation (CVᵣ)
└── 5. Angular Traversal: Σ Δθ_signed, Directional Consistency
         │
         ▼
5-State Motion Classification:
├── L < 0.045 or span < 0.030 ─────────────────────────────➔ STATIONARY
├── Circularity < 0.22 or thin line or reversal ───────────➔ LINEAR
├── Circularity ≥ 0.22, r̄ ∈ [0.02, 0.48], Consistency ≥ 0.65,
│   |Σ Δθ| ≥ 1.6 rad, and CVᵣ < 0.65 ──────────────────────➔ STIR (accumulate progress)
└── Otherwise ─────────────────────────────────────────────➔ RANDOM (erratic / jittery)
```

### Detailed Algorithm Mathematical Formulation

1. **Hand Anchor Point Extraction**:
   - Computes palm centroid from four topological anchors: Wrist (`0`), Index MCP (`5`), Middle MCP (`9`), and Pinky MCP (`17`).
   - Using the palm centroid filters finger articulation jitter and tremor while preserving global arm/wrist motion.
   - Falls back gracefully to Wrist (`0`) if full landmarks are unavailable.

2. **Principal Component Analysis (PCA) & Circularity**:
   - Calculates the $2 \times 2$ spatial covariance matrix of buffered positions:
     $$\operatorname{Var}_x = \frac{1}{N}\sum (x_i - \bar{x})^2, \quad \operatorname{Var}_y = \frac{1}{N}\sum (y_i - \bar{y})^2, \quad \operatorname{Cov}_{xy} = \frac{1}{N}\sum (x_i - \bar{x})(y_i - \bar{y})$$
   - Computes principal eigenvalues $\lambda_1$ (major axis variance) and $\lambda_2$ (minor axis variance).
   - Rotation-invariant **Circularity Metric**:
     $$\text{circularity} = \sqrt{\frac{\lambda_2}{\lambda_1 + 10^{-8}}}$$
     - Straight lines (horizontal, vertical, diagonal): $\lambda_2 \approx 0 \implies \text{circularity} < 0.20$
     - Circular/elliptical stirring: $\lambda_1 \approx \lambda_2 \implies \text{circularity} \in [0.45, 1.0]$

3. **Angular Traversal & Directional Consistency**:
   - Angle from centroid: $\theta_i = \operatorname{atan2}(y_i - \bar{y}, x_i - \bar{x})$.
   - Consecutive angular deltas: $\Delta \theta_i \in [-\pi, \pi]$.
   - Signed traversal: $\Delta \theta_{\text{signed}} = \sum \Delta \theta_i$.
   - Directional consistency:
     $$\text{consistency} = \frac{\max(N_{\text{positive steps}}, N_{\text{negative steps}})}{N_{\text{active steps}}}$$
     - Pure circular stirring achieves $\ge 85\%$ consistency in a single direction (clockwise or counter-clockwise).
     - Random shaking flutters around $50\%$.

4. **Progress Accumulation & Completion**:
   - Target stir angle: $\Theta_{\text{target}} = 3.5 \pi \text{ radians}$ ($\approx 1.75$ full rotational loops).
   - In each frame classified as `STIR`, the latest angular increment in the dominant direction adds to `accumulatedAngle`.
   - `progress = Math.min(1.0, accumulatedAngle / targetStirAngle)`.
   - When `progress >= 1.0`, `isComplete = true` and `detected = true`.
   - Pause decay: if stirring pauses, progress decays gently ($0.25/\text{sec}$) rather than dropping to zero instantly, forgiving short human hesitations.

---

## 4. Pipeline Data Flow

```
┌────────────────────────────────────────────────────────┐
│             MindAR (Single Camera Owner)               │
│                  <video> Element                       │
└──────────────────────────┬─────────────────────────────┘
                           │ frame
                           ▼
┌────────────────────────────────────────────────────────┐
│         Phase 4 MediaPipe HandLandmarker               │
│           Throttled Inference Loop (~12.5 FPS)         │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│           Standardized CVHandResult Contract           │
│        { detected, landmarks, timestamp, ... }         │
└──────────────────────────┬─────────────────────────────┘
                           │ (when Step 5 is active)
                           ▼
┌────────────────────────────────────────────────────────┐
│          Phase 5 Stir Motion Detector                  │
│       (src/cv/stirDetector.js — StirDetector)          │
│   • Palm centroid extraction                           │
│   • Sliding window trajectory buffer                   │
│   • PCA circularity & angular traversal                │
│   • 5-motion state classification                      │
│   • Progress accumulation & decay                      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│              Stir Detection Result Contract            │
│   { detected, confidence, motion, progress, ... }      │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
               ▼                          ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│       React View Layer      │ │        Recipe Engine        │
│   • Progress bar & %        │ │   • completeStep(5)         │
│   • Live feedback text      │ │   • Automatic nextStep()    │
│   • Debug pills             │ │     to Step 6               │
│   • Diagnostics drawer      │ │   • Manual fallback ready   │
└─────────────────────────────┘ └─────────────────────────────┘
```

---

## 5. State / Result Interface

The detector produces a clean, strongly-typed contract:

```typescript
interface StirDetectionResult {
  /** True when the required stirring motion has been successfully completed */
  detected: boolean;

  /** Confidence score normalized between [0.0 - 1.0] */
  confidence: number;

  /** Discrete motion classification */
  motion: "NONE" | "STATIONARY" | "LINEAR" | "RANDOM" | "STIR";

  /** Accumulated stir progress normalized between [0.0 - 1.0] */
  progress: number;

  /** Active position samples in sliding history window */
  sampleCount: number;

  /** Monotonic frame timestamp in milliseconds */
  timestamp: number;

  /** Whether the full target stir rotation has completed */
  isComplete: boolean;

  /** Detailed diagnostic metrics for inspector drawers */
  metrics: {
    pathLength: number;
    netDisplacement: number;
    circularity: number;
    directionalConsistency: number;
    accumulatedAngle: number;
    targetAngle: number;
    dominantDirection: number; // +1 (CCW) or -1 (CW)
    radius: number;
  };
}
```

---

## 6. Step 5 Integration & Lifecycle

- **Step 1 to Step 4**: Stir detector is idle and unmounted (`stirState.isActive = false`). It processes zero frames.
- **Step 4 → Step 5**:
  - `isStep5Active` becomes `true`.
  - Detector initializes fresh (`reset()`), buffer empty, progress at `0%`.
  - UI shows `STIR THE EGGS`, `Automatic detection: ON`, and `Waiting for hand...`.
- **User Performs Stirring**:
  - MediaPipe extracts hand coordinates.
  - Detector analyzes circular movement and classifies motion as `STIR`.
  - Progress bar advances smoothly in real-time from `0%` to `100%`.
  - Feedback label updates to `Stirring detected...`.
- **Stir Completion**:
  - Detector marks `isComplete: true` and `detected: true`.
  - UI displays `✓ Stir complete` with emerald glowing indicator.
  - After a 1.5-second feedback confirmation delay, Step 5 calls `completeStep(5)` and automatically advances to Step 6.
- **Step 5 → Step 6**:
  - Detector stops and resets.
  - Any pending auto-advance timer is cleared.
  - Stir detection module unmounts from Recipe HUD.
- **Navigating Back (Step 6 → Step 5)**:
  - Detector resets cleanly with 0% progress and fresh state.
- **Recipe Reset (`Restart` or `Cook Again`)**:
  - Detector completely resets and sleeps.
- **Recipe Completion (Step 7 Finish)**:
  - Detector is completely idle.

---

## 7. UI Changes

1. **Step 5 HUD Stir Module (`#stir-detection-module`)**:
   - Prominently positioned within the main instruction card.
   - Header with pulsating cyber-cyan indicator: `STIR THE EGGS` + `🤖 Automatic detection: ON`.
   - Smooth animated progress bar (`0%` → `100%`) with cyber-mint gradient (`#00f5d4` → `#38bdf8`) transitioning to emerald green (`#10b981`) upon completion.
   - Real-time status text:
     - `Waiting for hand...`
     - `Hand detected — start stirring`
     - `Stirring detected...`
     - `Move in circular motions (not straight lines)`
     - `Keep a continuous circular rhythm...`
     - `✓ Stir complete`
2. **Compact Debug Pills (`#stir-debug-info`)**:
   - Displayed inside the stir module when `Hand CV` is toggled on:
     - `Motion: STIR | Conf: 92% | Samples: 26`
3. **Floating Top CV Badge Metric (`#cv-stir-metric`)**:
   - Displays real-time stir motion and percentage: `STIR: STIR (74%)`.
4. **Diagnostics Drawer (`#camera-diag-drawer`)**:
   - Added `Stir Detection (Phase 5)` section:
     - Step 5 Active (`ACTIVE` / `STANDBY`)
     - Motion Type (`STIR`, `LINEAR`, `STATIONARY`, `RANDOM`, `NONE`)
     - Stir Progress (`0%` – `100%`)
     - Confidence (`0%` – `100%`)
     - Buffered Samples (`N`)
5. **AR Guidance Preservation**:
   - The Phase 3 3D circular stirring guidance arrow (`GuidanceManager.createStep5StirGuidance()`) continues to rotate inside the pan overlay simultaneously.

---

## 8. Failure Handling & Manual Fallback

- **Manual Fallback Never Blocked**:
  - The `✓ Completed / ○ Mark Done` button remains clickable at any moment.
  - The `Next Step` button remains clickable at any moment.
  - The step timer controls (`▶ Start Timer`, `⏸ Pause`, `↺ Reset`) operate normally.
- **No Hand in Camera**:
  - Detector reports `motion: NONE`, `statusText: 'Waiting for hand...'`. No crash, no false progress.
- **Straight-Line Swiping**:
  - Swiping or waving classifies as `LINEAR`. Stir progress does not trigger.
- **Erratic Jitter / Camera Shake**:
  - Classified as `RANDOM` via directional consistency check. Stir progress does not trigger.
- **Single-Frame Detection Drops**:
  - Brief drops (< 1.2s) do not wipe out user progress, forgiving momentary lighting changes or rapid movements.
- **Prolonged Tracking Loss**:
  - After 1.2 seconds without hand detection, history buffer clears and progress resets.
- **Multiple Hands**:
  - Analyzes the primary hand (`landmarks[0]`) consistently without throwing.
- **Invalid / Missing Timestamps**:
  - Automatically falls back to `performance.now()` / `Date.now()`.

---

## 9. Automated Verification Results

### A. Unit Tests (`cmd /c npm test`)
**53 tests across 7 test suites — 100% PASS (0 failures, 270ms)**

```
▶ Phase 4 CV Foundation — Result Normalizer (5 tests)                 ✔ PASS
▶ Phase 4 CV Foundation — Topological Constants (4 tests)             ✔ PASS
▶ Phase 4 CV Foundation — HandVisualizer Overlay (3 tests)            ✔ PASS
▶ Phase 4 CV Foundation — HandLandmarkerManager Lifecycle (6 tests)   ✔ PASS
▶ AR GuidanceManager — 3D Spatial Recipe Guidance Engine (12 tests)   ✔ PASS
▶ Recipe Engine — State Machine & Reducer (10 tests)                 ✔ PASS
▶ Phase 5 — StirDetector Unit Tests (13 tests)                        ✔ PASS
  ✔ 1. handles empty and no-hand inputs gracefully with NONE motion
  ✔ 2. detects STATIONARY motion when hand remains still
  ✔ 3. detects LINEAR motion for straight-line movements and does not trigger stir
  ✔ 4. distinguishes RANDOM erratic movement from circular stirring
  ✔ 5. detects valid circular motion as STIR and accumulates progress to completion
  ✔ 6. correctly tracks incomplete circular motion without falsely marking complete
  ✔ 7. reports STATIONARY and zero progress when sample count is below minSamples
  ✔ 8. handles temporary tracking loss and resets history upon prolonged loss
  ✔ 9. cleanly resets state, history, and progress when reset() is invoked
  ✔ 10. respects custom configuration options and confidence bounds [0.0 - 1.0]
  ✔ extractHandCenter handles diverse landmark topologies and fallbacks
  ✔ normalizeAngleDelta correctly normalizes across [-PI, PI]
  ✔ calculateMotionMetrics returns valid metrics for empty or 1-sample input

ℹ tests 53 | suites 7 | pass 53 | fail 0 | cancelled 0 | skipped 0 | todo 0
```

### B. Headless Chrome CDP Integration Test (`scripts/test-phase5-stir.mjs`)
**Executed against live HTTPS application instance:**

```
✓ Step 1: Stir module NOT visible in DOM
✓ Step 1 -> 4 navigation verified
✓ Step 5: #stir-detection-module mounted, titled "Stir", initial progress 0%
✓ Step 5: Diagnostics drawer contains Phase 5 ACTIVE metrics
✓ Step 5 -> 6 navigation: #stir-detection-module unmounts cleanly
✓ Step 6 -> 5 backward navigation: #stir-detection-module re-mounts clean with 0% progress
✓ Manual completion fallback verified: clicking .recipe-hud__done-badge marks step done
✓ 0 unhandled browser console exceptions
```

### C. Regression Verification
- `scripts/test-phase4-cv.mjs`: **PASSED** (CV canvas, video stream ownership, toggle button, diagnostics)
- `scripts/test-phase3-ar-guidance.mjs`: **PASSED** (All 7 AR spatial 3D guidance steps + celebration)
- `scripts/test-phase2-ui.mjs`: **PASSED** (Recipe HUD state machine, timers, forward/back)

### D. Code Quality & Build Checks
- **Linter (`cmd /c npm run lint` / `oxlint`)**: **0 warnings, 0 errors** across 35 files.
- **Production Bundle (`cmd /c npm run build` / `vite build`)**: **Built cleanly in 1.06s**.

---

## 10. Real-Device iPhone Verification

### Live URLs for Real-Device Safari Testing

1. **Cloudflare Quick Tunnel HTTPS (Recommended for iPhone)**:
   ```
   https://justice-outdoors-generating-bias.trycloudflare.com
   ```
2. **Local Network HTTPS (Same Wi-Fi)**:
   ```
   https://192.168.0.217:5173/
   ```
3. **Localhost**:
   ```
   https://localhost:5173/
   ```

### Real-Device Testing Protocol on iPhone

1. Open `https://justice-outdoors-generating-bias.trycloudflare.com` on iPhone in Safari.
2. Tap **Start Cooking** and allow Camera access.
3. Aim camera at printed marker: verify MindAR marker tracks and 3D guidance appears.
4. Advance through steps using **Next Step** to reach **Step 5 (Stir)**.
5. Verify Step 5 UI:
   - Module displays `STIR THE EGGS`.
   - `Automatic detection: ON`.
   - Status: `Waiting for hand...` (or `Hand detected — start stirring`).
   - Progress bar at `0%`.
6. Bring hand into view in front of the camera and stir in a continuous circular motion (either clockwise or counter-clockwise).
7. Verify detection:
   - Progress bar fills smoothly (`0%` → `100%`).
   - Status updates to `Stirring detected...`.
   - When complete, status turns to `✓ Stir complete` with celebration highlight.
   - After ~1.5s, Step 5 completes automatically and advances to Step 6.
8. Verify manual fallback:
   - Navigate back to Step 5: verify stir module resets to `0%`.
   - Tap `Mark Done` or `Next Step`: verify manual progression still works instantly without using hand gesture.
9. Navigate Step 5 → Step 6 → Step 5: verify clean activation and deactivation.

---

## 11. Known Limitations

- **Camera Frustum Occlusion**: Hand must be visible within the camera's field of view. Extreme close-ups where the wrist and palm are cut off will reduce detection confidence until the hand is repositioned.
- **Extreme Lighting Variations**: Very dark environments can degrade MediaPipe hand landmark detection. Manual fallback remains fully available for these conditions.

---

## 12. Phase Acceptance Checklist

- [x] Dedicated, testable `StirDetector` implemented and decoupled from React.
- [x] Movement analyzed over time via sliding window rather than single-frame "hand present".
- [x] Stable palm/wrist anchor extracted across frames.
- [x] 5-state motion classification implemented (`NONE`, `STATIONARY`, `LINEAR`, `RANDOM`, `STIR`).
- [x] MediaPipe HandLandmarker foundation from Phase 4 reused without breaking.
- [x] Single camera stream ownership preserved (no extra `getUserMedia()` calls).
- [x] Integrated strictly for Step 5 of the omelette recipe.
- [x] Successful stirring detection automatically completes Step 5 and advances to Step 6.
- [x] Manual fallback preserved and verified.
- [x] Step 5 HUD UI updated with progress indicator and status states.
- [x] Phase 3 3D circular stirring AR arrow preserved.
- [x] Unit tests cover all 10 required test criteria and pass cleanly.
- [x] Regression tests for Phase 2, 3, and 4 pass cleanly.
- [x] Lint (`oxlint`) passes with 0 warnings and 0 errors.
- [x] Production build passes cleanly.
- [x] Real-device HTTPS tunnel URL active and tested.
- [x] Git rule honored: zero commits or pushes performed.
- [x] Phase 6 has not been started.
