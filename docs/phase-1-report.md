# Phase 1 Report — AR Foundation & Tracking

## 1. Objective

Build, verify, and document the Augmented Reality (AR) foundation for AR-CookVision. This phase connects the compiled AR tracking target (`targets.mind`) with MindAR and Three.js, mounts the camera feed, renders an interactive holographic 3D test cube anchored to the printed marker, implements real-time tracking state indicators, provides a mobile-first responsive layout (390 × 844), ensures clean lifecycle teardown, and establishes a reliable mobile HTTPS testing workflow.

---

## 2. Key Accomplishments

1. **MindAR & Three.js Integration**:
   - Integrated `mind-ar` 1.2.5 image tracking with Three.js r186.
   - Resolved the `sRGBEncoding` deprecation incompatibility between MindAR and modern Three.js through a custom compatibility bridge (`src/ar/three-compat.js`).
   - Removed default MindAR UI overlays in favor of a custom, mobile-first glassmorphism HUD.
   - Polyfilled and updated Three.js r186 shadow maps (`THREE.PCFShadowMap`) and clock timing (`performance.now()`).

2. **3D Visual Scene & Holographic Test Cube**:
   - Anchored a high-fidelity 3D test cube to the printed AR marker (Anchor 0).
   - Implemented real-time animations: sinusoidal floating vertical oscillation, smooth turntable axial spin, and inner counter-rotating flame core.
   - Designed a ground targeting reticle with concentric rings, orientation tick marks, and 1.0 × 1.0 marker boundary brackets.
   - Added a dynamic billboard canvas sprite ("AR ANCHOR ACTIVE") floating above the 3D cube.
   - Built an interactive **3D Tools Drawer** allowing instant switching between visual modes (`Cube`, `Stove Ring`, `Wireframe`), color themes (`Flame Orange`, `Cyber Cyan`, `Emerald Fresh`), and motion toggles (`Rotation: ON/PAUSED`).

3. **Dynamic AR HUD & Feedback**:
   - Implemented scanning reticle overlay with sweeping laser animation and guide text during target search.
   - Added dynamic top HUD status pill with color-coded states:
     - 🔵 **Initializing**: Camera and tracking models loading
     - 🟡 **Scanning for Marker**: Camera active, scanning viewport for printed marker
     - 🟢 **ANCHOR LOCKED**: Active tracking with live FPS counter (e.g. 60 FPS)
     - 🔴 **Camera Error**: Permission denied or device error
   - Added tactile feedback (`navigator.vibrate`) upon target detection.

4. **Lifecycle & Clean Teardown**:
   - Encapsulated tracking logic in `ARManager` (`src/ar/arManager.js`) and `useAR` React hook (`src/hooks/useAR.js`).
   - Guaranteed full single-owner resource cleanup on unmount: stops camera hardware tracks, removes own injected DOM elements without collateral damage to other instances, cancels animation loops, and disposes WebGL geometries and materials.

5. **Mobile-First Responsive Layout**:
   - Verified on mobile viewport (390 × 844).
   - Applied CSS `clamp(2rem, 7.5vw, var(--font-size-3xl))` on StartScreen title to guarantee zero horizontal clipping and exact 390px scroll width (`bodyScrollWidth === 390px`).
   - Verified responsive HUD, instruction card, 3D Tools Drawer, and Marker Guide modal.

---

## 3. Real-Device iPhone Camera Diagnosis & Resolution

### Observed Symptom
When testing the application on a physical iPhone using a local IP HTTPS URL (`https://192.168.x.x:5173/`):
- Application UI rendered properly and user granted camera permission.
- The iPhone camera privacy indicator (green dot) appeared in the status bar.
- The top status pill showed `AR Standby` or `Scanning for Marker`, but the AR viewport remained pitch black.
- Live camera video was not visible, preventing marker detection.

### Isolation via Direct Standalone Camera Diagnostic
To isolate the camera failure without any framework interference, a development-only direct diagnostic page (`public/camera-test.html`) was created using solely native `navigator.mediaDevices.getUserMedia()` and a standard HTML `<video>` element (no React, Three.js, MindAR, or AR UI):
1. **Local IP with Self-Signed Certificate Test**:
   - Tested on iPhone via `https://192.168.x.x:5173/camera-test.html`.
   - Result: Permission granted, camera dot on, `readyState = 4`, `currentTime` advancing, but video element and pixel sensor showed **ALL BLACK PIXELS**.
2. **Globally-Trusted HTTPS Tunnel Test**:
   - Tested on iPhone via public tunnel with a trusted SSL certificate.
   - Result: **Both Front and Back cameras immediately displayed live, moving video feeds!**

### Root Cause Analysis
The diagnostic process isolated two distinct issues:

1. **iOS WebKit AVFoundation Security Restriction with Self-Signed Certificates**:
   - When accessing an untrusted, self-signed certificate over a raw LAN IP, iOS Safari allows the page to load if the user bypasses the warning, and even prompts for camera permission.
   - However, WebKit's media pipeline enforces a strict security sandbox: **AVFoundation blocks video frame delivery to untrusted TLS origins**. The camera sensor activates (green dot on), but the decoded frame buffer remains zeroed out (black).
   - **Resolution**: Use an authentic, trusted HTTPS tunnel (e.g. ngrok or Cloudflare Quick Tunnel) or an iOS-trusted root certificate (`mkcert` installed into iOS Certificate Trust Settings).

2. **React StrictMode Double-Mount Lifecycle Cancellation & Video Removal**:
   - In React 18, `StrictMode` executes effect setup, immediately triggers cleanup to test unmounting, and then re-runs setup.
   - In `src/hooks/useAR.js`, the effect cleanup executed `stopAR()` while the first `ARManager.start()` promise was in flight.
   - When the first promise finished, it saw `this.isCancelled = true` and executed `stop()`.
   - `ARManager.stop()` contained `this.container.querySelectorAll('video').forEach(v => v.remove())`, which deleted the video element created by the second active instance.
   - The UI fell back to `'idle'` ("AR Standby") with no video element in the DOM.
   - **Resolution**:
     - Removed `<StrictMode>` in `src/main.jsx` to prevent artificial double-mounting of hardware camera streams.
     - Refactored `src/hooks/useAR.js` so `startAR()` manages a single persistent instance across the component lifecycle.
     - Updated `ARManager.stop()` to only stop and remove its own `this.mindarThree.video` and `this.renderer.domElement`, eliminating collateral removal of DOM elements.
     - Explicitly configured `this.renderer.setClearColor(0x000000, 0)` and `this.renderer.domElement.style.background = 'transparent'` to guarantee WebGL canvas transparency.
     - Added `-webkit-transform: translateZ(0) !important; transform: translate3d(0, 0, 0) !important;` to `.cooking-screen__viewport video` in `CookingScreen.css` for iOS hardware compositing.

---

## 4. Real-Device iPhone Verification Evidence

The user personally tested and verified the application on a physical iPhone:

| Verification Item | Result | Notes |
|---|---|---|
| **Live Camera Feed** | ✅ **PASS** | Live camera video visible and fluid behind the AR HUD. |
| **MindAR Target Detection** | ✅ **PASS** | Pointing phone at printed marker detects target immediately. |
| **Status Feedback** | ✅ **PASS** | Top pill transitions to `ANCHOR LOCKED (60 FPS)`. |
| **3D Holographic Anchor** | ✅ **PASS** | 3D test cube with glowing core renders anchored to physical marker. |
| **Motion Stability** | ✅ **PASS** | Moving phone around marker maintains stable 3D pose anchoring. |
| **Reacquisition** | ✅ **PASS** | Moving marker out of frame loses lock; returning it reacquires lock instantly. |
| **Clean Teardown** | ✅ **PASS** | Tapping `< Back` releases camera hardware and returns cleanly to StartScreen. |

---

## 5. Development & Testing Setup for Mobile Devices

### Vite Configuration (`vite.config.js`)
The Vite server is configured for seamless local and tunnel development:
- `server.host = '0.0.0.0'` (listens on all network interfaces)
- `server.port = 5173`
- `server.strictPort = true` (ensures consistent port for tunnels)
- `server.allowedHosts = true` (allows tunnel host headers like `*.ngrok-free.app` and `*.trycloudflare.com`)
- `server.cors = true`

### Tunnel Commands

To expose the local development server for testing on mobile devices with trusted HTTPS:

#### Option A: ngrok
```bash
ngrok http https://localhost:5173 --host-header="rewrite"
```

#### Option B: Cloudflare Quick Tunnel (no account required)
```bash
cloudflared.exe tunnel --url https://localhost:5173 --no-tls-verify
```

---

## 6. Verification Results Matrix

| Test Item | Status | Details / Evidence |
|---|---|---|
| **Build Validation** | ✅ PASS | `npm run build` succeeds cleanly with 0 errors (`dist/`). |
| **Linter Validation** | ✅ PASS | `npm run lint` (oxlint) reports 0 errors and 0 warnings across 15 files with 104 rules. |
| **Localhost Server** | ✅ PASS | Vite server running on port 5173; HTTP 200 OK verified on `https://localhost:5173/`. |
| **Mobile Tunnel Testing** | ✅ PASS | HTTP 200 OK verified for root app, `/targets/targets.mind`, and `/targets/marker.png`. |
| **Mobile Viewport (390 × 844)** | ✅ PASS | Zero horizontal overflow (`bodyScrollWidth = 390px`). |
| **Physical Marker Tracking** | ✅ **PASS** | Confirmed on physical iPhone with printed marker. |
| **Holographic 3D Anchor** | ✅ **PASS** | Confirmed on physical iPhone with 3D cube and targeting rings. |
| **Lifecycle & Teardown** | ✅ PASS | Camera hardware released and DOM elements cleaned on navigation back. |
| **Console / Runtime Errors** | ✅ PASS | 0 JavaScript errors, 0 unhandled promise rejections. |

---

## 7. Technology Architecture

```
src/
├── ar/
│   ├── three-compat.js     # Three.js r186 bridge (polyfils sRGBEncoding)
│   └── arManager.js        # AR engine, iOS video MutationObserver, 3D test scene, single-owner teardown
├── hooks/
│   └── useAR.js            # React hook for AR lifecycle, diagnostics polling, recovery triggers
├── components/
│   ├── StartScreen.jsx     # Landing screen with responsive title & direct navigation
│   ├── StartScreen.css     # Mobile-first styles (clamp title, glassmorphism)
│   ├── CookingScreen.jsx   # Live AR viewport, reticle, 3D tools, diagnostics drawer, standby card
│   ├── CookingScreen.css   # Viewport isolation, z-index layers (1: video, 2: canvas), GPU transforms
│   ├── LoadingScreen.jsx   # Fast transition indicator
│   └── ErrorScreen.jsx     # Fallback AR error recovery screen
├── public/
│   ├── targets/            # Compiled marker target (targets.mind) and image (marker.png)
│   └── camera-test.html    # Standalone direct camera diagnostic tool for device testing
├── main.jsx                # React root without StrictMode for WebAR hardware compatibility
└── vite.config.js          # HTTPS server, allowedHosts: true, strictPort, cors
```

---

## 8. Phase 1 Acceptance Status

**Phase 1 AR Foundation is COMPLETE and ACCEPTED.**

- [x] MindAR image tracking foundation operational
- [x] Three.js r186 integration with sRGBEncoding compatibility bridge
- [x] Anchored 3D test cube with animation, lighting, materials, and inner glowing core
- [x] Ground targeting reticle and marker bounds visualization
- [x] Dynamic AR HUD with scanning laser and live FPS tracking
- [x] Interactive 3D Inspector (Cube, Stove Ring, Wireframe, palettes, motion toggle)
- [x] iPhone camera pipeline diagnosed and resolved (TLS security policy + React lifecycle fixes)
- [x] Physical iPhone live feed, marker detection, 3D anchor, and reacquisition verified
- [x] Robust single-owner camera lifecycle and teardown
- [x] Mobile viewport responsive layout (390 × 844) verified
- [x] Production build passes (0 errors)
- [x] Linter passes (0 errors, 0 warnings)
- [x] Development server and tunnel documentation complete

---

## 9. Next Phase Status

**Phase 2 has NOT been started.**

Phase 2 will implement the Recipe Engine:
- Recipe JSON data schema (ingredients, equipment, sequential steps, timers)
- Step navigation state machine (Step 1–7 engine, Next/Back navigation)
- Integration of step metadata and timers with the AR HUD
- Cooking step progress tracking
