import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9228

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run() {
  console.log('Testing Phase 4 Computer Vision Foundation on https://localhost:5173/ ...')
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
      '--window-size=390,844',
      '--user-data-dir=' + path.join(os.tmpdir(), 'chrome-p4-' + Date.now()),
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  try {
    await sleep(1500)
    const newTargetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?https://localhost:5173/`, {
      method: 'PUT',
    })
    const target = await newTargetRes.json()
    const ws = new WebSocket(target.webSocketDebuggerUrl)

    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    const consoleLogs = []
    const uncaughtErrors = []

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ')
        consoleLogs.push(`[${msg.params.type}] ${text}`)
        if (msg.params.type === 'error') {
          console.error(`[BROWSER ERROR] ${text}`)
        }
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const desc = msg.params.exceptionDetails.exception?.description || JSON.stringify(msg.params.exceptionDetails)
        console.error(`[BROWSER EXCEPTION]`, desc)
        uncaughtErrors.push(desc)
      }
    })

    let id = 1
    function sendCommand(method, params = {}) {
      const msgId = id++
      return new Promise((resolve) => {
        const handler = (event) => {
          const res = JSON.parse(event.data)
          if (res.id === msgId) {
            ws.removeEventListener('message', handler)
            resolve(res.result)
          }
        }
        ws.addEventListener('message', handler)
        ws.send(JSON.stringify({ id: msgId, method, params }))
      })
    }

    await sendCommand('Runtime.enable')
    await sendCommand('Page.enable')

    console.log('Waiting for initial screen render...')
    for (let i = 0; i < 20; i++) {
      const check = await sendCommand('Runtime.evaluate', {
        expression: `!!document.getElementById('btn-start-cooking')`,
        returnByValue: true,
      })
      if (check.result.value) break
      await sleep(300)
    }

    // 1. Transition to Cooking Screen
    console.log('Transitioning to CookingScreen...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-start-cooking')?.click()`,
    })

    console.log('Waiting for #ar-viewport and video to mount...')
    for (let i = 0; i < 25; i++) {
      const check = await sendCommand('Runtime.evaluate', {
        expression: `!!document.getElementById('ar-viewport') && !!document.querySelector('#ar-viewport video')`,
        returnByValue: true,
      })
      if (check.result.value) break
      await sleep(300)
    }

    // 2. Verify MindAR video and Phase 4 CV Canvas mounted
    const elementsCheck = await sendCommand('Runtime.evaluate', {
      expression: `
        JSON.stringify({
          viewportExists: !!document.getElementById('ar-viewport'),
          videoExists: !!document.querySelector('#ar-viewport video'),
          arCanvasExists: !!document.querySelector('#ar-viewport canvas:not(#cv-debug-canvas)'),
          cvCanvasExists: !!document.getElementById('cv-debug-canvas'),
          cvBadgeExists: !!document.getElementById('cv-status-badge'),
          cvBtnExists: !!document.getElementById('btn-cv-debug'),
          recipeHudExists: !!document.getElementById('recipe-hud'),
        })
      `,
      returnByValue: true,
    })

    const elResult = JSON.parse(elementsCheck.result.value)
    console.log('DOM Elements Mounted:', elResult)

    if (!elResult.viewportExists) throw new Error('Viewport #ar-viewport missing')
    if (!elResult.cvCanvasExists) throw new Error('#cv-debug-canvas missing in DOM')
    if (!elResult.cvBadgeExists) throw new Error('#cv-status-badge missing in DOM')
    if (!elResult.cvBtnExists) throw new Error('#btn-cv-debug toggle button missing')
    if (!elResult.recipeHudExists) throw new Error('#recipe-hud missing')

    // 3. Verify single camera stream constraint (no second getUserMedia stream)
    const streamCountCheck = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const videos = document.querySelectorAll('video');
          return JSON.stringify({
            videoCount: videos.length,
            streamTracks: videos[0]?.srcObject?.getVideoTracks()?.length || 0
          });
        })()
      `,
      returnByValue: true,
    })
    const streamCount = JSON.parse(streamCountCheck.result.value)
    console.log('Camera Video Stream Ownership:', streamCount)
    if (streamCount.videoCount > 1) {
      throw new Error(`Multiple video elements detected (${streamCount.videoCount})! Single camera owner constraint violated.`)
    }

    // 4. Test Hand CV Toggle button
    console.log('Testing Hand CV overlay toggle (off)...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-cv-debug')?.click()`,
    })
    await sleep(300)

    const toggleOffCheck = await sendCommand('Runtime.evaluate', {
      expression: `
        JSON.stringify({
          canvasHasHidden: document.getElementById('cv-debug-canvas')?.classList.contains('hidden'),
          badgePresent: !!document.getElementById('cv-status-badge')
        })
      `,
      returnByValue: true,
    })
    const offState = JSON.parse(toggleOffCheck.result.value)
    console.log('Toggle OFF state:', offState)
    if (!offState.canvasHasHidden || offState.badgePresent) {
      throw new Error('Hand CV toggle did not hide overlay properly')
    }

    console.log('Testing Hand CV overlay toggle (on)...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-cv-debug')?.click()`,
    })
    await sleep(300)

    const toggleOnCheck = await sendCommand('Runtime.evaluate', {
      expression: `
        JSON.stringify({
          canvasHasVisible: document.getElementById('cv-debug-canvas')?.classList.contains('visible'),
          badgePresent: !!document.getElementById('cv-status-badge')
        })
      `,
      returnByValue: true,
    })
    const onState = JSON.parse(toggleOnCheck.result.value)
    console.log('Toggle ON state:', onState)
    if (!onState.canvasHasVisible || !onState.badgePresent) {
      throw new Error('Hand CV toggle did not restore overlay properly')
    }

    // 5. Test Camera Diagnostics drawer contains Phase 4 CV metrics
    console.log('Opening Cam Info diagnostics drawer...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-diagnostics')?.click()`,
    })
    await sleep(400)

    const diagCheck = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const drawer = document.getElementById('camera-diag-drawer');
          if (!drawer) return JSON.stringify({ drawerFound: false });
          const text = drawer.innerText.toLowerCase();
          return JSON.stringify({
            drawerFound: true,
            hasCvHeader: text.includes('hand cv tracking') || text.includes('phase 4'),
            hasCvEngine: text.includes('cv engine:'),
            hasModelAsset: text.includes('/models/hand_landmarker.task')
          });
        })()
      `,
      returnByValue: true,
    })
    const diagState = JSON.parse(diagCheck.result.value)
    console.log('Diagnostics CV Section:', diagState)
    if (!diagState.drawerFound || !diagState.hasCvHeader || !diagState.hasModelAsset) {
      throw new Error('Diagnostics drawer did not contain expected Phase 4 CV info')
    }

    // Close diagnostics
    await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('.tools-drawer__close')?.click()`,
    })
    await sleep(300)

    // 6. Verify Recipe Engine & AR Guidance still work with CV active
    console.log('Advancing Recipe HUD Step 1 -> Step 2...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-step-next')?.click()`,
    })
    await sleep(400)

    const step2Check = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const stepInd = document.getElementById('step-indicator')?.innerText;
          const currentStep = window.__arGuidance?.activeStep;
          return JSON.stringify({ stepInd, currentStep });
        })()
      `,
      returnByValue: true,
    })
    const step2State = JSON.parse(step2Check.result.value)
    console.log('Step 2 Coexistence State:', step2State)
    if (!step2State.stepInd?.includes('2') || step2State.currentStep !== 2) {
      throw new Error('Recipe / AR Guidance step advance failed while CV is running')
    }

    // 7. Verify no uncaught exceptions occurred
    if (uncaughtErrors.length > 0) {
      throw new Error(`Uncaught browser errors detected during test: ${uncaughtErrors.join(' | ')}`)
    }

    console.log('\n=== ALL PHASE 4 COMPUTER VISION FOUNDATION CHECKS PASSED! ===\n')
    ws.close()
  } catch (err) {
    console.error('Test failed:', err)
    process.exitCode = 1
  } finally {
    try {
      chromeProcess.kill()
    } catch {}
  }
}

run()
