# AR-CookVision

## Project Overview

AR-CookVision is a smartphone-based, browser-based Augmented Reality Smart Cooking Assistant designed for real kitchens. It provides real-time AR cooking guidance overlaid on your actual cooking environment using a printed image-target marker for spatial tracking.

## Objective

Guide users through cooking recipes step-by-step using augmented reality overlays visible through their smartphone camera, with computer vision features for detecting cooking actions like stirring.

## Current Phase

**Phase 7 — Testing, Deployment & Final Validation**

AR-CookVision has reached Phase 7 with complete AR guidance and CV stir recognition:
- **Phase 0 & 1**: MindAR spatial tracking, Three.js 3D scene, and target marker pipeline
- **Phase 2**: Recipe State Machine, 7-step French Omelette guidance, timers, and progress tracking
- **Phase 3**: 3D spatial AR guidance manager with tailored visual cues for all 7 cooking steps
- **Phase 4**: MediaPipe HandLandmarker computer vision foundation sharing the MindAR camera feed
- **Phase 5**: Real-time stir motion detection with PCA circularity analysis and Step 5 auto-completion
- **Phase 7**: Comprehensive regression tests (79 passing tests), static asset validation, deployment readiness, and iPhone Safari testing documentation

## Technology Stack

| Technology | Purpose |
|---|---|
| [React](https://react.dev/) | UI framework (v19) |
| [Vite](https://vite.dev/) | Build tool & HTTPS dev server (v8.3) |
| [Three.js](https://threejs.org/) | 3D rendering for AR cooking overlays (r186) |
| [MindAR](https://hiukim.github.io/mind-ar-js-doc/) | Image-target AR tracking (v1.2.5) |
| [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) | Hand landmark tracking & CV (v1.0.1) |
| [Oxlint](https://oxc.rs/) | Fast JavaScript linter |

## Project Structure

```
ar-cookvision/
├── public/
│   ├── targets/          # AR marker images & compiled targets.mind
│   │   ├── marker.png
│   │   ├── marker-print.png
│   │   └── targets.mind
│   ├── models/           # MediaPipe task models (hand_landmarker.task)
│   ├── wasm/             # MediaPipe WebAssembly runtime binaries & loaders
│   ├── icons.svg         # SVG icon symbol sprites
│   ├── camera-test.html  # Standalone camera diagnostic tool
│   └── compile.html      # Browser-based target compiler
├── src/
│   ├── ar/               # AR tracking & 3D spatial guidance (guidanceManager.js, arManager.js)
│   ├── cv/               # Computer vision & stir detection (stirDetector.js, handLandmarkerManager.js)
│   ├── engine/           # Recipe state machine & reducer (recipeReducer.js)
│   ├── data/recipes/     # Recipe JSON definitions (omelette.json)
│   ├── components/       # Screens and HUD overlays (CookingScreen, RecipeHUD, StartScreen)
│   ├── hooks/            # Custom React hooks (useAR, useRecipe, useHandTracking, useStirDetection)
│   ├── App.jsx           # Application root
│   ├── index.css         # Design tokens & glassmorphism styling
│   └── main.jsx          # Vite React entry point
├── tests/                # Automated regression test suites (79 tests)
│   ├── cv-foundation.test.js
│   ├── deployment-assets.test.js
│   ├── guidance-manager.test.js
│   ├── recipe-engine.test.js
│   ├── recipe-regression.test.js
│   ├── stir-detector.test.js
│   └── stir-regression.test.js
├── scripts/              # CDP integration scripts and MindAR target compiler
├── docs/                 # Phase reports and placement guides
├── index.html            # HTML entry point with mobile viewport configuration
├── vite.config.js        # Vite configuration with HTTPS & BasicSSL
└── package.json
```

## Local Development & Testing

### Prerequisites

- Node.js >= 18 (Tested on Node.js v24)
- npm

### Installation

```bash
# Standard install (use --ignore-scripts if native canvas build tools are not installed on Windows)
npm install --ignore-scripts
```

### Development Server (HTTPS Enabled)

```bash
npm run dev
```

The dev server starts with HTTPS enabled at `https://localhost:5173/` and binds to `0.0.0.0` for local network device access.

### Testing & Validation Commands

```bash
# Run all 79 automated regression tests (Node.js test runner)
npm test

# Run Oxlint code quality checks
npm run lint

# Build production bundle for deployment
npm run build

# Validate entire project in one step (lint + test + build)
npm run validate

# Preview local production build
npm run preview
```

## Mobile & iPhone Safari Testing Guide

### Why HTTPS is Required
The WebRTC camera API (`navigator.mediaDevices.getUserMedia()`) is restricted to **Secure Contexts**. Mobile browsers (iOS Safari, Android Chrome) will reject camera access when loaded over plain HTTP from a local network IP (e.g. `http://192.168.x.x:5173`).

### Step-by-Step iPhone Safari Setup
1. **Connect to Same Network**: Ensure your iPhone and development machine are connected to the same Wi-Fi network.
2. **Start Dev Server**: Run `npm run dev`. Note the Network URL printed in terminal (e.g., `https://192.168.1.50:5173/`).
3. **Open URL in Safari**: Navigate to the HTTPS Network URL on your iPhone.
4. **Bypass Self-Signed Certificate Warning**:
   - Safari displays *"This Connection Is Not Private"*.
   - Tap **Show Details** at the bottom.
   - Tap **visit this website** and confirm with passcode if prompted.
5. **Grant Camera Permission**:
   - When prompted with *"ar-cookvision Would Like to Access the Camera"*, tap **Allow**.
   - If accidentally denied, tap the `aA` icon in the Safari address bar > **Website Settings** > **Camera** > **Allow**.
6. **Position AR Marker**: Place the printed marker flat on a heat-safe kitchen surface. The camera HUD will transition from `Scanning` to `Tracking` once the target is recognized.

## Production Deployment

### Recommended Static Hosting Providers
- **Cloudflare Pages**: Global edge network with HTTP/2 and large static asset streaming (recommended).
- **Vercel**: Edge network with automatic deployment. Add `vercel.json` for SPA routing.
- **Netlify**: Static CDN. Add `_redirects` (`/* /index.html 200`) for single-page routing.

### Key Deployment Considerations
1. **MIME Types**: Ensure your host serves:
   - `.wasm` as `application/wasm`
   - `.task` and `.mind` as `application/octet-stream`
   - `.svg` as `image/svg+xml`
2. **Static Asset Caching**: Set immutable caching headers (`Cache-Control: public, max-age=31536000, immutable`) for `/wasm/*`, `/models/*`, `/targets/*`, and `/assets/*`.
3. **Large File Transfers**: Initial download includes ~22.8 MB of WASM and model files; verify your host does not enforce aggressive bandwidth or payload timeouts.

## Safety & Best Practices

⚠️ **Keep your phone, hands, and printed AR marker safely away from open flames, burner coils, and hot oil splashes.**
See [docs/marker-placement-guide.md](docs/marker-placement-guide.md) for marker placement guidelines.

## Phase History

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Project Setup, HTTPS & Basic AR Marker | ✅ Completed |
| Phase 1 | AR Foundation — MindAR tracking, Three.js scene, test cube | ✅ Completed |
| Phase 2 | Recipe Engine — 7-step state machine, HUD, timers | ✅ Completed |
| Phase 3 | AR Cooking Guidance — 3D overlays, pan rings, timers | ✅ Completed |
| Phase 4 | Computer Vision — MediaPipe HandLandmarker foundation | ✅ Completed |
| Phase 5 | Stir Detection — PCA circularity analysis & auto-advance | ✅ Completed |
| Phase 6 | Robustness & Safety — Bug fixes & resilience | Reviewed separately |
| Phase 7 | Testing, Deployment & Final Validation — 79 tests, asset checks, deployment docs | ✅ Completed |

## License

MIT
