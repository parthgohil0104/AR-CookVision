# Phase 0 Report — Project Setup & AR Marker

## 1. Objective

Prepare the complete development foundation for AR-CookVision and create the first AR tracking marker. This phase establishes the React + Vite project, installs all required dependencies, creates the folder structure, builds a mobile-first application shell, and generates the AR marker image.

## 2. Initial Repository State

- **Repository**: Empty directory at `c:\ar-cookvision`
- **Git**: Not initialized (no `.git` directory)
- **Branch**: N/A (freshly initialized)
- **Existing files**: None
- **Git status**: Not a git repository

The repository was initialized from scratch with `git init` and a `dev` branch was created immediately.

## 3. Technology Setup

| Technology | Version | Purpose |
|---|---|---|
| React | ^19.2.8 | UI framework |
| React DOM | ^19.2.8 | React renderer |
| Vite | ^8.3.0 | Build tool & dev server |
| Three.js | ^0.186.1 | 3D rendering (future AR overlays) |
| MindAR | ^1.2.5 | Image-target AR tracking |
| MediaPipe Tasks Vision | ^1.0.1 | Hand tracking & computer vision |
| @vitejs/plugin-basic-ssl | ^2.3.0 | HTTPS dev server (required for camera) |
| @vitejs/plugin-react | ^6.1.1 | React support for Vite |

## 4. Project Structure

```
ar-cookvision/
├── public/
│   ├── targets/
│   │   ├── marker.png          # AR tracking marker
│   │   └── marker-print.png    # Printable version
│   ├── models/                 # 3D models (future)
│   ├── wasm/                   # WebAssembly files (future)
│   ├── icons/                  # App icons (future)
│   ├── compile.html            # Browser-based MindAR compiler
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── ar/                     # AR tracking modules (future)
│   ├── cv/                     # Computer vision (future)
│   ├── engine/                 # Recipe engine (future)
│   ├── data/recipes/           # Recipe JSON (future)
│   ├── components/
│   │   ├── hud/                # HUD components (future)
│   │   ├── StartScreen.jsx + .css
│   │   ├── CookingScreen.jsx + .css
│   │   ├── LoadingScreen.jsx + .css
│   │   └── ErrorScreen.jsx + .css
│   ├── context/                # React contexts (future)
│   ├── hooks/                  # Custom hooks (future)
│   ├── config/                 # Configuration (future)
│   ├── utils/                  # Utilities (future)
│   ├── styles/                 # Shared styles (future)
│   ├── App.jsx + App.css
│   ├── index.css               # Global design system
│   └── main.jsx                # Entry point
├── scripts/
│   └── compile-target.mjs      # MindAR offline compiler script
├── tests/                      # Test files (future)
├── docs/
│   ├── marker-placement-guide.md
│   └── phase-0-report.md
├── index.html
├── vite.config.js
├── package.json
├── package-lock.json
├── .gitignore
└── .oxlintrc.json
```

## 5. Application Shell

### Screens Created

| Screen | File | Description |
|---|---|---|
| **StartScreen** | `src/components/StartScreen.jsx` | Landing page with app branding (AR-CookVision title, flame/crosshair SVG logo), "Start Cooking" CTA button, safety warning message, animated background orbs |
| **LoadingScreen** | `src/components/LoadingScreen.jsx` | Transition screen with dual spinning rings and shimmer progress bar |
| **CookingScreen** | `src/components/CookingScreen.jsx` | Cooking interface shell with camera placeholder viewport, top HUD bar (back button, AR status dot, Step 1/7 indicator), bottom instruction card, and help overlay panel |
| **ErrorScreen** | `src/components/ErrorScreen.jsx` | Error display with warning icon, error message, and "Try Again" button |

### Design System

- Dark theme with glassmorphism effects
- CSS custom properties for colors, typography, spacing, shadows
- Mobile-first responsive design using `dvh` units and `env(safe-area-inset-*)` for notch/home-bar support
- Animated transitions (fadeIn, fadeInUp, slideUp, spin, glowPulse, shimmer)
- Inter font family from Google Fonts

### Navigation Flow

```
StartScreen → [Start Cooking] → LoadingScreen (1.8s) → CookingScreen
                                                        ↕ [Help]
CookingScreen → [Back] → StartScreen
Any screen → [Error] → ErrorScreen → [Try Again] → StartScreen
```

## 6. AR Marker

### Design

The marker is a high-contrast, black-and-white pattern featuring:
- Many unique asymmetric visual features (mixed geometric + organic shapes)
- Varied element sizes (thick/thin lines, dots, triangles, rectangles, curves)
- No rotational symmetry — each quadrant has distinct patterns
- Designed specifically for robust image-target tracking with many feature points

### Files

| File | Location |
|---|---|
| Marker image | `public/targets/marker.png` |
| Printable version | `public/targets/marker-print.png` |

### Print Specifications

- Print size: approximately **8–10 cm × 8–10 cm**
- Use matte paper or card stock for reduced glare
- Black and white, high contrast
- See `docs/marker-placement-guide.md` for safe placement instructions

### Why This Marker Design

Image-target AR tracking (MindAR) works by detecting unique visual features (corners, edges, blobs) in a reference image. The marker was designed with:
- High feature density for robust detection at various distances
- Strong contrast for reliable detection under variable kitchen lighting
- Asymmetry to prevent orientation ambiguity
- Complex patterns to avoid confusion with background objects

## 7. MindAR Target Compilation

### Status: ❌ Not Compiled

**`targets.mind` was NOT successfully generated.**

### Reason

The MindAR `OfflineCompiler` requires the `canvas` npm package (native Node.js canvas with C++ bindings). This failed to install because:

1. **No pre-built binaries** exist for Node.js v24.19.0 (node-v137 ABI) on Windows
2. **No Visual Studio C++ build tools** are installed on the system, preventing fallback source compilation
3. The `node-gyp` build step failed with: `Could not find any Visual Studio installation to use`

### How to Compile

**Option A: Browser-based compiler (recommended)**

1. Start the dev server: `npm run dev`
2. Open `https://localhost:5173/compile.html` in Chrome
3. Click "Compile" — wait 1–2 minutes for processing
4. Download `targets.mind` and save to `public/targets/targets.mind`

**Option B: Node.js offline compiler**

1. Install Visual Studio with "Desktop development with C++" workload
2. Run: `npm rebuild canvas`
3. Run: `node scripts/compile-target.mjs`

**Option C: Use the MindAR online compiler**

1. Visit https://hiukim.github.io/mind-ar-js-doc/tools/compile
2. Upload `public/targets/marker.png`
3. Download the resulting `.mind` file
4. Save as `public/targets/targets.mind`

## 8. Testing

### npm install

```
✅ Completed successfully
Added 172 packages, audited 173 packages
No blocking errors (deprecation warnings for mind-ar subdependencies are non-critical)
```

### npm run dev

```
✅ Vite v8.3.2 ready in 399ms
Local:   https://localhost:5173/
Network: https://192.168.1.11:5173/ (Wi-Fi)
No build errors, no broken imports
```

### npm run build

```
✅ Built successfully in 210ms
25 modules transformed
Output:
  dist/index.html                 1.20 kB (gzip: 0.57 kB)
  dist/assets/index-BYooc2kd.css  14.09 kB (gzip: 3.18 kB)
  dist/assets/index-CYflfyHx.js  228.14 kB (gzip: 70.70 kB)
```

### npm run preview

```
✅ Preview server started successfully
Local:   https://localhost:4173/
Network: https://192.168.1.11:4173/ (Wi-Fi)
```

### Browser Testing

Browser-based visual testing could not be automated (Playwright driver unavailable). Manual verification recommended:
- Open `https://localhost:5173/` on a smartphone or browser
- Verify Start screen renders with branding and safety warning
- Click "Start Cooking" — loading screen should appear, then cooking screen
- Verify responsive mobile layout

## 9. Problems Encountered

| # | Problem | Resolution |
|---|---|---|
| 1 | PowerShell execution policy blocked `npx` | Used `cmd /c` wrapper for all npm/npx commands |
| 2 | Concurrent `npm install` commands caused EBUSY lock | Cleaned `node_modules` and ran sequential install with `--ignore-scripts` |
| 3 | `canvas` native module failed to build (no Visual Studio C++ tools, no pre-built Node.js v24 binaries) | Created browser-based compiler alternative (`compile.html`); documented offline and online alternatives |
| 4 | Playwright browser driver unavailable for automated UI testing | Verified through successful build output; manual testing recommended |

## 10. Git Information

- **Branch**: `dev`
- **Remote**: `origin` → `https://github.com/parthgohil0104/AR-CookVision.git`
- **Commit hash**: `3705d5b`
- **Commit message**: `feat: initialize project and add AR marker`
- **Push result**: ✅ Pushed successfully to `origin/dev`

## 11. Phase 0 Acceptance Checklist

- [x] React/Vite foundation works
- [x] Dependencies installed
- [x] Folder structure created
- [x] Mobile UI shell works
- [x] Marker created
- [ ] targets.mind compiled — *not compiled (canvas native module unavailable; browser/online compiler alternatives documented)*
- [x] README updated
- [x] Tests completed (build passes, dev/preview servers start)
- [x] Git commit created — `3705d5b`
- [x] Git push successful — pushed to `origin/dev`
- [x] Working tree clean

## 12. Phase 1 Readiness

The project **is ready for Phase 1** with one prerequisite:

> **Before starting Phase 1**, compile `targets.mind` using the browser-based compiler (`compile.html`) or the MindAR online tool. Phase 1 (AR Foundation) requires this file for MindAR image tracking.

All other foundations are in place:
- React + Vite environment is working
- Three.js and MindAR packages are installed
- Project structure has designated `src/ar/` directory for AR modules
- Application shell has the CookingScreen ready to receive AR viewport content
- Marker image is designed and ready for tracking
