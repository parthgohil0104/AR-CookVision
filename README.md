# AR-CookVision

## Project Overview

AR-CookVision is a smartphone-based, browser-based Augmented Reality Smart Cooking Assistant designed for real kitchens. It provides real-time AR cooking guidance overlaid on your actual cooking environment using a printed image-target marker for spatial tracking.

## Objective

Guide users through cooking recipes step-by-step using augmented reality overlays visible through their smartphone camera, with computer vision features for detecting cooking actions like stirring.

## Current Phase

**Phase 1 — AR Foundation (Completed)**

The core AR foundation is live:
- Real-time image-target tracking via MindAR using `/targets/targets.mind`
- Three.js r186 3D scene integration with compatibility bridge
- Holographic 3D test cube anchored in real kitchen space with floating oscillation and rotation
- Targeting reticle with scanning laser animation and dynamic HUD status
- Interactive 3D Inspector drawer (visual mode, color palette, motion toggle)
- Camera lifecycle management, permission handling, and clean WebGL disposal

## Technology Stack

| Technology | Purpose |
|---|---|
| [React](https://react.dev/) | UI framework |
| [Vite](https://vite.dev/) | Build tool & dev server |
| [Three.js](https://threejs.org/) | 3D rendering for AR overlays |
| [MindAR](https://hiukim.github.io/mind-ar-js-doc/) | Image-target AR tracking |
| [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) | Hand/gesture tracking & computer vision |

## Project Structure

```
ar-cookvision/
├── public/
│   ├── targets/          # AR marker images & compiled .mind files
│   │   ├── marker.png
│   │   └── marker-print.png
│   ├── models/           # 3D models (future)
│   ├── wasm/             # WebAssembly files (future)
│   └── icons/            # App icons
├── src/
│   ├── ar/               # AR tracking modules (future)
│   ├── cv/               # Computer vision modules (future)
│   ├── engine/           # Recipe engine (future)
│   ├── data/
│   │   └── recipes/      # Recipe JSON files (future)
│   ├── components/
│   │   ├── hud/          # HUD overlay components (future)
│   │   ├── StartScreen.jsx
│   │   ├── CookingScreen.jsx
│   │   ├── LoadingScreen.jsx
│   │   └── ErrorScreen.jsx
│   ├── context/          # React context providers (future)
│   ├── hooks/            # Custom React hooks (future)
│   ├── config/           # App configuration (future)
│   ├── utils/            # Utility functions (future)
│   ├── styles/           # Shared styles (future)
│   ├── App.jsx
│   ├── App.css
│   ├── index.css
│   └── main.jsx
├── scripts/
│   └── compile-target.mjs  # MindAR target compiler script
├── tests/                # Test files (future)
├── docs/
│   ├── marker-placement-guide.md
│   └── phase-0-report.md
├── index.html
├── vite.config.js
└── package.json
```

## Local Development

### Prerequisites

- Node.js >= 18
- npm

### Setup

```bash
npm install
```

### Development Server

```bash
npm run dev
```

The dev server starts with HTTPS enabled (required for camera access on mobile). Access the app on your phone via the local network URL shown in the terminal.

### Production Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Compile AR Target (Browser Method)

1. Start the dev server: `npm run dev`
2. Open `https://localhost:5173/compile.html` in your browser
3. Click "Compile" and wait for processing
4. Download `targets.mind` and save to `public/targets/`

## Current Features

- Real-time AR image tracking using MindAR and compiled `targets.mind`
- Three.js 3D scene with dynamic lighting, shadows, and materials
- Anchored 3D test cube with floating animation, wireframe edges, inner glowing flame core, and ground target ring
- Interactive 3D Inspector (Cube mode, Stove Ring mode, Wireframe mode, color palettes, rotation toggle)
- Dynamic scanning reticle with laser animation and marker alignment guide
- Real-time AR HUD status indicator (Initializing, Scanning, Locked with live FPS counter)
- Camera permission handling with user-friendly error recovery
- Interactive Marker Guide modal with placement tips and visual preview
- Mobile-first dark-themed UI with glassmorphism design
- HTTPS dev server for mobile camera access
- Offline MindAR compilation tooling via SharpCompiler (`npm run compile:target`)

## Safety

⚠️ **Keep the phone and AR marker away from flame, heat, and oil splashes.**

See [docs/marker-placement-guide.md](docs/marker-placement-guide.md) for detailed safety instructions.

## Future Phases

| Phase | Description | Status |
|---|---|---|
| Phase 0 | Project Setup & AR Marker | ✅ Completed |
| Phase 1 | AR Foundation — MindAR tracking, Three.js scene, test cube | ✅ Completed |
| Phase 2 | Recipe Engine — Recipe JSON format, step navigation | ⏳ Next |
| Phase 3 | AR Cooking Guidance — AR overlays, timers, step instructions | Pending |
| Phase 4 | Computer Vision — MediaPipe hand tracking | Pending |
| Phase 5 | Stir Detection — Cooking action recognition | Pending |
| Phase 6 | Robustness & Safety — Error handling, edge cases | Pending |
| Phase 7 | Testing & Deployment — Automated tests, CI/CD | Pending |
| Phase 8 | Documentation — Full user & developer documentation | Pending |

## License

MIT
