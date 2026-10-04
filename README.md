# AR-CookVision

## Project Overview

AR-CookVision is a smartphone-based, browser-based Augmented Reality Smart Cooking Assistant designed for real kitchens. It provides real-time AR cooking guidance overlaid on your actual cooking environment using a printed image-target marker for spatial tracking.

## Objective

Guide users through cooking recipes step-by-step using augmented reality overlays visible through their smartphone camera, with computer vision features for detecting cooking actions like stirring.

## Current Phase

**Phase 0 — Project Setup & AR Marker**

The project foundation has been established with:
- React + Vite development environment
- Mobile-first application shell with start, loading, cooking, and error screens
- AR tracking marker designed and ready for printing
- Project folder structure for all future phases

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

- Mobile-first dark-themed UI with glassmorphism design
- Start screen with branding, safety warning, and "Start Cooking" button
- Loading screen with animated spinner
- Cooking screen placeholder with HUD elements (AR status, step indicator, instruction card, help overlay)
- Error screen with retry functionality
- AR tracking marker image ready for printing (8–10 cm)
- HTTPS dev server for mobile camera access

## Safety

⚠️ **Keep the phone and AR marker away from flame, heat, and oil splashes.**

See [docs/marker-placement-guide.md](docs/marker-placement-guide.md) for detailed safety instructions.

## Future Phases

| Phase | Description |
|---|---|
| Phase 1 | AR Foundation — MindAR tracking, Three.js scene, test cube |
| Phase 2 | Recipe Engine — Recipe JSON format, step navigation |
| Phase 3 | AR Cooking Guidance — AR overlays, timers, step instructions |
| Phase 4 | Computer Vision — MediaPipe hand tracking |
| Phase 5 | Stir Detection — Cooking action recognition |
| Phase 6 | Robustness & Safety — Error handling, edge cases |
| Phase 7 | Testing & Deployment — Automated tests, CI/CD |
| Phase 8 | Documentation — Full user & developer documentation |

## License

MIT
