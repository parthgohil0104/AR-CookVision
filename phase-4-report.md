# Phase 4 Report — Computer Vision Foundation

## 1. Objective

Integrate MediaPipe Tasks Vision HandLandmarker into AR-CookVision as an independent, throttled computer-vision subsystem providing real-time hand-landmark detection.
Phase 4 focuses **only** on the CV foundation, preparing the clean data contract and visualization infrastructure without implementing automatic stir-motion detection (reserved for Phase 5).

Key architectural objectives:
1. MediaPipe Tasks Vision HandLandmarker integration.
2. Single camera stream ownership: MindAR retains exclusive ownership of the camera stream; the CV subsystem never calls `getUserMedia()`.
3. Frames processed directly from the MindAR `<video>` element.
4. Total independence from Recipe Engine, AR GuidanceManager, and future stir-motion detection.
5. Standardized `CVHandResult` contract for Phase 5 consumption.
6. Throttled processing (~12.5 FPS / 80ms) to ensure smooth 60 FPS Three.js rendering and prevent battery/thermal throttling on mobile devices.
7. Full lifecycle management: start, pause, stop, and dispose.
8. Robust error handling for 0 hands, 1 hand, multi-hand, model initialization faults, and WebGL fallbacks.
9. Development/debug visualization overlay (neon cyber-mint hand skeleton and status pill) distinguishable from flame-orange AR 3D guidance.

---

## 2. Files Created & Modified

| File | Type | Description |
|---|---|---|
| `public/models/hand_landmarker.task` | Asset | Google MediaPipe pre-trained HandLandmarker float16 model bundle (7,819,105 bytes). |
| `public/wasm/*` | Asset | 6 MediaPipe Tasks Vision WASM & JS loader runtime files for local, self-contained loading without CDN dependencies. |
| `src/cv/cvTypes.js` | Source | 21 hand landmark indices, fingertip constants, 21 skeletal connection pairs, and mobile default configuration. |
| `src/cv/resultNormalizer.js` | Source | Pure normalizer function converting raw MediaPipe outputs into a standardized, engine-agnostic `CVHandResult` contract. |
| `src/cv/handLandmarkerManager.js` | Source | Subsystem manager encapsulating MediaPipe lifecycle, throttled video inference, GPU-to-CPU fallback, re-entrancy guard, monotonic timestamps, and subscriber event dispatch. |
| `src/cv/handVisualizer.js` | Source | 2D canvas overlay visualizer rendering cyber-mint skeleton connections, cyan joints, glowing fingertips, and handedness badges. |
| `src/cv/index.js` | Source | Public module exports for the CV subsystem. |
| `src/hooks/useHandTracking.js` | Source | React hook connecting `HandLandmarkerManager` and `HandVisualizer` to the view layer, bypassing React reconciliation for 60 FPS canvas drawing while syncing detection changes to UI state. |
| `src/ar/arManager.js` | Modified | Added `getVideoElement()` method so MediaPipe accesses camera frames from MindAR's video stream without opening a second camera stream. |
| `src/hooks/useAR.js` | Modified | Exposed `getVideoElement` callback from `useAR`. |
| `src/components/CookingScreen.jsx` | Modified | Mounted Layer 3 CV canvas, floating CV status badge, `btn-cv-debug` ("Hand CV") toggle button in the HUD, and CV metrics in the diagnostics drawer. |
| `src/components/CookingScreen.css` | Modified | Layer 3 CV canvas stacking (`z-index: 3`), cyber-mint CV status badge, tool button active states, and diagnostics drawer CV section. |
| `tests/cv-foundation.test.js` | Test | Automated unit tests covering result normalization, topological constants, mock visualizer rendering, lifecycle, and throttling guards. |
| `scripts/test-phase4-cv.mjs` | Script | Headless Chrome CDP integration test verifying single camera stream constraint, CV canvas mounting, toggle button, diagnostics integration, and coexistence with Recipe Engine and AR guidance. |
| `.eslintignore`, `.oxlintignore` | Config | Ignore rules for public WASM binary assets. |
| `docs/phase-4-report.md` | Doc | Phase 4 implementation report, test matrices, and real-device verification evidence. |

---

## 3. MediaPipe Implementation Details

- **Single Camera Stream Ownership**: MindAR remains the single owner of the camera stream. The CV subsystem never invokes `navigator.mediaDevices.getUserMedia()`. It receives the `<video>` element created by MindAR via `arManager.getVideoElement()`.
- **Running Mode**: `runningMode: 'VIDEO'` using `detectForVideo(videoElement, timestamp)`.
- **Monotonic Frame Timestamps**: MediaPipe requires timestamps to be strictly monotonically increasing. HandLandmarkerManager enforces `timestamp = Math.max(now, this.lastVideoTimestamp + 1)`.
- **Backend Fallback (GPU → CPU)**: Attempts WebGL acceleration (`delegate: 'GPU'`). If WebGL context creation fails (e.g. mobile Safari context limits alongside Three.js and MindAR), it catches the error and falls back to `delegate: 'CPU'`.
- **Fault Tolerance**: Any transient inference exceptions (such as temporary frame drops or WebGL interruptions) are caught without throwing unhandled exceptions, keeping MindAR tracking and the Recipe HUD intact.

---

## 4. Model Information & Path

- **Source**: Official Google MediaPipe pre-trained Hand Landmarker bundle (`hand_landmarker.task`)
- **Project-Relative Path**: `/models/hand_landmarker.task` (`public/models/hand_landmarker.task`)
- **WASM Path**: `/wasm/` (`public/wasm/vision_wasm_internal.wasm`, etc.)
- **Expected Size**: 7,819,105 bytes (~7.8 MB)
- **Loading Behavior**: Asynchronously loaded during app startup / CookingScreen mount via `FilesetResolver.forVisionTasks('/wasm')` and `HandLandmarker.createFromOptions()`. Completely self-contained with no runtime CDN dependency.

---

## 5. CV Architecture & Subsystem Independence

```
               ┌────────────────────────────────────────────────────────┐
               │              MindAR (Single Stream Owner)              │
               │                   <video> Element                      │
               └──────────────────────────┬─────────────────────────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
        ┌─────────────────────────┐               ┌─────────────────────────┐
        │   AR 3D Anchor Layer    │               │  Computer Vision (CV)   │
        │ Three.js 3D Scene (z=2) │               │   HandLandmarkerManager │
        │  CookingGuidanceManager │               │      (Throttled Loop)   │
        └─────────────────────────┘               └────────────┬────────────┘
                                                               │ normalized
                                                               ▼
                                                  ┌─────────────────────────┐
                                                  │      CVHandResult       │
                                                  │       Contract          │
                                                  └──────┬────────────┬─────┘
                                                         │            │
                                 ┌───────────────────────┘            └────────────────────────┐
                                 ▼                                                             ▼
                     ┌───────────────────────┐                                     ┌───────────────────────┐
                     │    HandVisualizer     │                                     │  Phase 5 (Future)     │
                     │ 2D Debug Canvas (z=3) │                                     │  Stir Motion Detector │
                     └───────────────────────┘                                     └───────────────────────┘
```

The CV subsystem is decoupled from:
- **Recipe Engine**: Only receives camera frames from the DOM; does not touch recipe steps or timers.
- **AR GuidanceManager**: Renders on its own 2D canvas layer (`z-index: 3`) above Three.js (`z-index: 2`).
- **Phase 5 Stir Detection**: Will consume the clean `CVHandResult` stream via `manager.addListener(cb)` without needing to modify the CV foundation.

---

## 6. Normalized CV Result Interface

```typescript
interface CVHandResult {
  detected: boolean;                                     // Whether at least one hand is detected
  handCount: number;                                     // 0, 1, or 2
  landmarks: Array<Array<{ x: number, y: number, z: number }>>; // 21 normalized coordinates [0..1]
  worldLandmarks: Array<Array<{ x: number, y: number, z: number }>>; // Metric 3D world coordinates
  handedness: Array<{ label: string, score: number, index: number }>; // e.g. [{ label: 'Right', score: 0.96 }]
  timestamp: number;                                     // Monotonic frame timestamp in ms
  inferenceTimeMs: number;                               // Duration of inference in ms
  fps: number;                                           // Rolling inference FPS
  status: 'idle' | 'initializing' | 'ready' | 'tracking' | 'no-hand' | 'error' | 'disposed';
}
```

---

## 7. Mobile Throttling & Performance Strategy

- **Throttle Interval**: Default `throttleMs: 80` (~12.5 FPS). Balances responsive hand tracking with mobile CPU/GPU conservation.
- **Video Readiness Gate**: Skips inference if video element is not ready (`readyState < 2`, `videoWidth === 0`, or video is paused).
- **Re-entrancy Guard**: Skips frames if a previous inference call is still running (`isProcessing === true`), preventing frame queue pileup.
- **High-Frequency React Decoupling**: Landmark updates are sent directly from the manager to the 2D canvas visualizer. Normal React state is only updated on status transitions (`detected` change or 500ms diagnostic poller), keeping React rendering lightweight and AR animations smooth at 60 FPS.

---

## 8. Debug Visualization

- **Visual Contrast**: Uses cyber-mint (`#00f5a0`) skeletal lines, cyan (`#06b6d4`) joint dots, glowing amber (`#fbbf24`) fingertips, and a magenta (`#ec4899`) wrist anchor. Visually distinct from the flame-orange / amber AR 3D guidance layer.
- **CV Status Badge**: Floating glassmorphism pill displaying detection state (`HAND DETECTED (1)` / `NO HAND IN VIEW`), inference latency (`22 ms`), and rolling FPS (`12.5 FPS`).
- **Non-Intrusive Control**: Can be toggled on/off using the **Hand CV** button in the top tools bar (`#btn-cv-debug`).
- **Diagnostics Integration**: Full CV metrics (Engine status, hand count, latency, model asset path, WASM backend) displayed in the **Cam Info** drawer (`#btn-diagnostics`).

---

## 9. Automated Verification Results

### A. Node.js Unit Tests (`npm test`)
```
▶ Phase 4 CV Foundation — Result Normalizer (5 tests)                 ✔ PASS
▶ Phase 4 CV Foundation — Topological Constants (4 tests)             ✔ PASS
▶ Phase 4 CV Foundation — HandVisualizer Overlay (3 tests)            ✔ PASS
▶ Phase 4 CV Foundation — HandLandmarkerManager Lifecycle & Guards (6 tests) ✔ PASS
▶ AR GuidanceManager — 3D Spatial Recipe Guidance Engine (12 tests)   ✔ PASS
▶ Recipe Engine — State Machine & Reducer (10 tests)                 ✔ PASS
Total: 40 tests across 6 suites, 0 failures (183ms)
```

### B. Headless Chrome Integration Check (`scripts/test-phase4-cv.mjs`)
```
✓ DOM Elements Mounted (#cv-debug-canvas, #cv-status-badge, #btn-cv-debug)
✓ Single Camera Video Stream Ownership verified (videoCount: 1)
✓ Hand CV overlay toggle (off/on) verified
✓ Diagnostics drawer CV metrics verified
✓ Step advance Step 1 -> Step 2 verified while CV is running
✓ 0 unhandled browser console exceptions
```

### C. Phase 2 & Phase 3 Integration Checks
- `scripts/test-phase3-ar-guidance.mjs`: Verified all 7 spatial guidance steps, celebration, and reset pass without interference.
- `scripts/test-phase2-ui.mjs`: Verified Recipe HUD navigation, timers, and step state pass without interference.

### D. Code Quality & Build Checks
- **Lint (`npm run lint` / `oxlint`)**: **0 warnings, 0 errors** across 31 files.
- **Build (`npm run build` / `vite build`)**: **Built cleanly** in 760ms.

---

## 10. Real-Device iPhone Verification Evidence

The user personally tested and verified Phase 4 on a physical iPhone using cellular internet / hotspot via the Cloudflare tunnel URL (`https://compiled-cooling-picked-wendy.trycloudflare.com`):

| Verification Item | Result | Notes |
|---|---|---|
| **Camera Feed** | ✅ **PASS** | MindAR camera stream initializes smoothly with no second camera permission or stream requested. |
| **MindAR Marker Tracking** | ✅ **PASS** | Target marker recognized immediately with stable 3D plane tracking. |
| **AR 3D Anchor & Phase 3 Guidance** | ✅ **PASS** | 3D cooking guidance (rings, cues, stirring indicator, timers) remains fully functional alongside CV. |
| **MediaPipe Initialization** | ✅ **PASS** | HandLandmarker loads asynchronously from local `/models/hand_landmarker.task` and `/wasm/` assets without external CDN. |
| **Hand Landmarks & Skeleton Visualization** | ✅ **PASS** | Placing hand in camera frustum immediately renders cyber-mint 21-joint skeleton, connections, and glowing fingertips on canvas overlay. |
| **Hand Detection State Transition** | ✅ **PASS** | Hand enter/leave transitions instantly between `HAND DETECTED (1)` and `NO HAND IN VIEW`. |
| **Hand CV Debug Toggle** | ✅ **PASS** | Tapping "Hand CV" tool button cleanly toggles the debug overlay canvas and badge on/off without interrupting AR. |
| **Recipe Step Navigation with CV Active** | ✅ **PASS** | Moving forward/backward through recipe steps (`Next`, `Back`, `Restart`) operates smoothly with zero interference from MediaPipe. |
| **Rendering Performance** | ✅ **PASS** | Three.js rendering remains smooth; throttled inference (~12.5 FPS) prevents mobile heating and frame drop. |
| **Recipe HUD Stability** | ✅ **PASS** | Bottom HUD, instructions, timers, and modal dialogs remain fully responsive. |

---

## 11. Phase 4 Acceptance Status

**Phase 4 Computer Vision Foundation is COMPLETE and ACCEPTED.**

- [x] MediaPipe Tasks Vision HandLandmarker integrated as an independent CV subsystem
- [x] MindAR preserved as single camera stream owner (no secondary `getUserMedia` calls)
- [x] HandLandmarker processes frames directly from existing MindAR video element
- [x] Fully independent from Recipe Engine, AR GuidanceManager, and future stir detection
- [x] Clean, standardized `CVHandResult` contract created
- [x] Throttled mobile-friendly processing (~12.5 FPS) implemented with re-entrancy guards
- [x] Full lifecycle management (start, pause, stop, dispose)
- [x] HandLandmarker model asset (`/models/hand_landmarker.task`) and WASM binaries stored locally
- [x] High-contrast 2D debug visualizer with toggleable overlay canvas and status pill
- [x] Automated test suite passing 40/40 tests (`npm test`)
- [x] Automated CDP headless browser tests passing 100%
- [x] Linter passing with 0 errors and 0 warnings (`oxlint`)
- [x] Production build passing cleanly with 0 errors (`vite build`)
- [x] Real-device iPhone testing verified and officially accepted
- [x] Ready for Git commit on `dev`

---

## 12. Next Phase Status

**Phase 5 has NOT been started.** Awaiting explicit approval before starting Phase 5 (Stir-Motion Detection).
