import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9222

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run() {
  console.log('--- Starting Chrome with Fake Media Stream and CDP ---')
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      '--remote-debugging-port=' + PORT,
      '--ignore-certificate-errors',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-first-run',
      '--no-default-browser-check',
      '--user-data-dir=' + path.join(os.tmpdir(), 'chrome-cdp-profile-' + Date.now()),
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  try {
    let versionData = null
    for (let i = 0; i < 20; i++) {
      await sleep(500)
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
        if (res.ok) {
          versionData = await res.json()
          break
        }
      } catch {
        // retry
      }
    }

    if (!versionData) {
      throw new Error('Chrome CDP failed to start on port ' + PORT)
    }

    console.log('Connected to Chrome:', versionData.Browser)

    // Create a new target/page
    const newTargetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?https://localhost:5173/`, {
      method: 'PUT',
    })
    const target = await newTargetRes.json()
    const wsUrl = target.webSocketDebuggerUrl
    console.log('Page WebSocket:', wsUrl)

    // Connect WebSocket
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    let messageId = 1
    const pending = new Map()
    const consoleLogs = []
    const jsErrors = []

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) {
          reject(msg.error)
        } else {
          resolve(msg.result)
        }
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ')
        consoleLogs.push(`[Console ${msg.params.type}] ${text}`)
        console.log(`[Browser Console ${msg.params.type}] ${text}`)
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const err = msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || '')
        jsErrors.push(err)
        console.error(`[Browser JS Error] ${err}`)
      }
    }

    function sendCommand(method, params = {}) {
      const id = messageId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    }

    // Enable domains
    await sendCommand('Runtime.enable')
    await sendCommand('Page.enable')
    await sendCommand('DOM.enable')

    // Emulate mobile viewport: 390 x 844, scale 2
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
      screenOrientation: { angle: 0, type: 'portraitPrimary' },
    })

    console.log('Mobile viewport 390x844 configured.')

    // Navigate to application
    await sendCommand('Page.navigate', { url: 'https://localhost:5173/' })
    await sleep(2000)

    // Evaluate Start Screen
    const startScreenMetrics = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const el = document.querySelector('#start-screen');
          const title = document.querySelector('.start-screen__title');
          const subtitle = document.querySelector('.start-screen__subtitle');
          const btn = document.querySelector('#btn-start-cooking');
          const version = document.querySelector('.start-screen__version');
          return {
            hasStartScreen: !!el,
            titleText: title ? title.innerText : null,
            subtitleText: subtitle ? subtitle.innerText : null,
            hasStartBtn: !!btn,
            btnText: btn ? btn.innerText : null,
            versionText: version ? version.innerText : null,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            bodyScrollWidth: document.body.scrollWidth,
            titleWidth: title ? title.getBoundingClientRect().width : null,
          };
        })()
      `,
      returnByValue: true,
    })
    console.log('Start Screen Evaluation:', JSON.stringify(startScreenMetrics.result.value, null, 2))

    // Capture screenshot of Start Screen
    const startShot = await sendCommand('Page.captureScreenshot', { format: 'png' })
    const startShotPath = path.join(os.tmpdir(), 'screenshot_start_mobile.png')
    fs.writeFileSync(startShotPath, Buffer.from(startShot.data, 'base64'))
    console.log('Saved', startShotPath)

    // Click "Start Cooking"
    console.log('Clicking "Start Cooking"...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('#btn-start-cooking').click()`,
    })

    // Wait for immediate transition to cooking screen
    console.log('Waiting for CookingScreen to mount (800ms)...')
    await sleep(800)

    // Evaluate Cooking Screen
    const cookingScreenMetrics = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const cookingScreen = document.querySelector('#cooking-screen');
          const viewport = document.querySelector('#ar-viewport');
          const status = document.querySelector('#ar-status');
          const stepIndicator = document.querySelector('#step-indicator');
          const instruction = document.querySelector('#instruction-text');
          const btnBack = document.querySelector('#btn-back');
          const btnTools = document.querySelector('#btn-ar-tools');
          const btnDiag = document.querySelector('#btn-diagnostics');
          const btnHelp = document.querySelector('#btn-help');
          const video = document.querySelector('#ar-viewport video');
          const canvas = document.querySelector('#ar-viewport canvas');

          return {
            hasCookingScreen: !!cookingScreen,
            hasViewport: !!viewport,
            statusText: status ? status.innerText : null,
            stepText: stepIndicator ? stepIndicator.innerText : null,
            instructionText: instruction ? instruction.innerText : null,
            hasBackBtn: !!btnBack,
            hasToolsBtn: !!btnTools,
            hasDiagBtn: !!btnDiag,
            hasHelpBtn: !!btnHelp,
            hasVideo: !!video,
            videoWidth: video ? video.videoWidth : null,
            videoHeight: video ? video.videoHeight : null,
            hasCanvas: !!canvas,
            canvasWidth: canvas ? canvas.width : null,
            canvasHeight: canvas ? canvas.height : null,
          };
        })()
      `,
      returnByValue: true,
    })
    console.log('Cooking Screen Evaluation:', JSON.stringify(cookingScreenMetrics.result.value, null, 2))

    // Capture screenshot of Cooking Screen (initial)
    const cookingShot = await sendCommand('Page.captureScreenshot', { format: 'png' })
    const cookingShotPath = path.join(os.tmpdir(), 'screenshot_cooking_mobile.png')
    fs.writeFileSync(cookingShotPath, Buffer.from(cookingShot.data, 'base64'))
    console.log('Saved', cookingShotPath)

    // Wait for MindAR to initialize camera feed and start searching/tracking
    console.log('Waiting 4s for MindAR engine to initialize...')
    await sleep(4000)

    const arEngineState = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const status = document.querySelector('#ar-status');
          const video = document.querySelector('#ar-viewport video');
          const canvas = document.querySelector('#ar-viewport canvas');
          const reticle = document.querySelector('#ar-reticle');
          const lockedBadge = document.querySelector('.cooking-screen__locked-badge');
          return {
            statusText: status ? status.innerText : null,
            reticleVisible: !!reticle,
            lockedBadgeVisible: !!lockedBadge,
            videoReadyState: video ? video.readyState : null,
            videoWidth: video ? video.videoWidth : null,
            videoHeight: video ? video.videoHeight : null,
            videoZIndex: video ? window.getComputedStyle(video).zIndex : null,
            canvasZIndex: canvas ? window.getComputedStyle(canvas).zIndex : null,
            canvasWidth: canvas ? canvas.width : null,
            canvasHeight: canvas ? canvas.height : null,
          };
        })()
      `,
      returnByValue: true,
    })
    console.log('AR Engine State after init:', JSON.stringify(arEngineState.result.value, null, 2))

    // Test Diagnostics Drawer
    console.log('Opening Diagnostics Drawer...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('#btn-diagnostics').click()`,
    })
    await sleep(500)

    const diagDrawerState = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const drawer = document.querySelector('#camera-diag-drawer');
          const rows = Array.from(document.querySelectorAll('.diag-row')).map(r => r.innerText.replace('\\n', ' '));
          return {
            diagDrawerOpen: !!drawer,
            rows,
          };
        })()
      `,
      returnByValue: true,
    })
    console.log('Diagnostics Drawer State:', JSON.stringify(diagDrawerState.result.value, null, 2))

    const diagShot = await sendCommand('Page.captureScreenshot', { format: 'png' })
    const diagShotPath = path.join(os.tmpdir(), 'screenshot_diagnostics.png')
    fs.writeFileSync(diagShotPath, Buffer.from(diagShot.data, 'base64'))
    console.log('Saved', diagShotPath)

    // Close Diagnostics Drawer
    await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('#btn-diagnostics').click()`,
    })
    await sleep(300)

    // Test 3D Tools Drawer
    console.log('Opening 3D Tools Drawer...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('#btn-ar-tools').click()`,
    })
    await sleep(500)

    const toolsDrawerState = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const drawer = document.querySelector('#ar-tools-drawer');
          const chips = Array.from(document.querySelectorAll('.tools-chip')).map(c => c.innerText);
          return {
            drawerOpen: !!drawer,
            chips,
          };
        })()
      `,
      returnByValue: true,
    })
    console.log('3D Tools Drawer State:', JSON.stringify(toolsDrawerState.result.value, null, 2))

    const toolsShot = await sendCommand('Page.captureScreenshot', { format: 'png' })
    const toolsShotPath = path.join(os.tmpdir(), 'screenshot_tools_drawer.png')
    fs.writeFileSync(toolsShotPath, Buffer.from(toolsShot.data, 'base64'))
    console.log('Saved', toolsShotPath)

    // Close 3D Tools Drawer
    await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('#btn-ar-tools').click()`,
    })
    await sleep(300)

    // Test Help Modal (Marker Guide)
    console.log('Opening Marker Guide Help modal...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('#btn-help').click()`,
    })
    await sleep(500)

    const helpState = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const overlay = document.querySelector('#help-overlay');
          const markerImg = document.querySelector('.help-marker-img');
          return {
            overlayVisible: !!overlay,
            markerImgSrc: markerImg ? markerImg.src : null,
            markerImgComplete: markerImg ? markerImg.complete : null,
            markerImgNaturalWidth: markerImg ? markerImg.naturalWidth : null,
          };
        })()
      `,
      returnByValue: true,
    })
    console.log('Help Modal State:', JSON.stringify(helpState.result.value, null, 2))

    const helpShot = await sendCommand('Page.captureScreenshot', { format: 'png' })
    const helpShotPath = path.join(os.tmpdir(), 'screenshot_help_modal.png')
    fs.writeFileSync(helpShotPath, Buffer.from(helpShot.data, 'base64'))
    console.log('Saved', helpShotPath)

    // Close Help Modal
    console.log('Closing Marker Guide Help modal...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('#btn-help-close').click()`,
    })
    await sleep(500)

    // Test Back button (teardown)
    console.log('Testing Back button and cleanup...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('#btn-back').click()`,
    })
    await sleep(800)

    const backState = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          return {
            hasStartScreen: !!document.querySelector('#start-screen'),
            hasCookingScreen: !!document.querySelector('#cooking-screen'),
            activeVideos: document.querySelectorAll('video').length,
          };
        })()
      `,
      returnByValue: true,
    })
    console.log('After Back Navigation State:', JSON.stringify(backState.result.value, null, 2))

    console.log('\n--- Test Summary ---')
    console.log(`Console logs captured: ${consoleLogs.length}`)
    console.log(`JS Errors captured: ${jsErrors.length}`)
    if (jsErrors.length > 0) {
      console.log('Errors:', jsErrors)
    }

    ws.close()
  } finally {
    console.log('Shutting down Chrome test process...')
    chromeProcess.kill('SIGTERM')
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
