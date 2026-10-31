import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9229

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run() {
  console.log('Testing Phase 5 Stir-Motion Detection UI & Lifecycle on https://localhost:5173/ ...')
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
      '--user-data-dir=' + path.join(os.tmpdir(), 'chrome-p5-' + Date.now()),
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

    const uncaughtErrors = []

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
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

    // 1. Enter Cooking Screen
    console.log('Transitioning to CookingScreen...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-start-cooking')?.click()`,
    })

    await sleep(1500)

    // 2. Step 1: Stir Module must NOT be visible
    console.log('Checking Step 1 (Position Pan)...')
    const step1Check = await sendCommand('Runtime.evaluate', {
      expression: `
        JSON.stringify({
          stepText: document.getElementById('step-indicator')?.textContent?.trim(),
          hasStirModule: !!document.getElementById('stir-detection-module')
        })
      `,
      returnByValue: true,
    })
    const step1State = JSON.parse(step1Check.result.value)
    console.log('Step 1 State:', step1State)
    if (step1State.hasStirModule) {
      throw new Error('Stir module must NOT be visible on Step 1!')
    }

    // 3. Navigate forward to Step 5
    console.log('Navigating forward through recipe steps to Step 5 (Stir)...')
    for (let step = 1; step <= 4; step++) {
      await sendCommand('Runtime.evaluate', {
        expression: `document.getElementById('btn-step-next')?.click()`,
      })
      await sleep(400)
    }

    // 4. Verify Step 5 Active and Stir Module Mounted
    const step5Check = await sendCommand('Runtime.evaluate', {
      expression: `
        JSON.stringify({
          stepText: document.getElementById('step-indicator')?.textContent?.trim(),
          stepTitle: document.getElementById('step-title')?.textContent?.trim(),
          hasStirModule: !!document.getElementById('stir-detection-module'),
          stirStatusText: document.getElementById('stir-status-text')?.textContent?.trim(),
          stirProgressPct: document.getElementById('stir-progress-pct')?.textContent?.trim(),
          hasDebugInfo: !!document.getElementById('stir-debug-info')
        })
      `,
      returnByValue: true,
    })
    const step5State = JSON.parse(step5Check.result.value)
    console.log('Step 5 State:', step5State)

    if (!step5State.hasStirModule) {
      throw new Error('#stir-detection-module missing on Step 5!')
    }
    if (!step5State.stepTitle.toLowerCase().includes('stir')) {
      throw new Error(`Expected Step 5 to be Stir, got ${step5State.stepTitle}`)
    }
    if (!step5State.stirProgressPct.includes('0%')) {
      throw new Error(`Expected initial progress 0%, got ${step5State.stirProgressPct}`)
    }

    // 5. Check Diagnostics Drawer contains Step 5 Active metrics
    console.log('Checking Diagnostics Drawer for Phase 5 metrics...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-diagnostics')?.click()`,
    })
    await sleep(400)

    const diagCheck = await sendCommand('Runtime.evaluate', {
      expression: `
        (() => {
          const drawer = document.getElementById('camera-diag-drawer');
          return JSON.stringify({
            drawerVisible: !!drawer,
            text: drawer ? drawer.textContent : ''
          });
        })()
      `,
      returnByValue: true,
    })
    const diagState = JSON.parse(diagCheck.result.value)
    if (!diagState.text.includes('Stir Detection (Phase 5)') || !diagState.text.includes('ACTIVE')) {
      throw new Error('Diagnostics drawer missing Phase 5 active metrics!')
    }
    console.log('Diagnostics Drawer Phase 5 metrics verified!')

    // Close diagnostics
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-diagnostics')?.click()`,
    })
    await sleep(300)

    // 6. Test Navigation: Step 5 -> Step 6 (Stir module unmounts)
    console.log('Navigating Step 5 -> Step 6 (Cook)...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-step-next')?.click()`,
    })
    await sleep(400)

    const step6Check = await sendCommand('Runtime.evaluate', {
      expression: `
        JSON.stringify({
          stepText: document.getElementById('step-indicator')?.textContent?.trim(),
          stepTitle: document.getElementById('step-title')?.textContent?.trim(),
          hasStirModule: !!document.getElementById('stir-detection-module')
        })
      `,
      returnByValue: true,
    })
    const step6State = JSON.parse(step6Check.result.value)
    console.log('Step 6 State:', step6State)

    if (step6State.hasStirModule) {
      throw new Error('Stir module must NOT be visible on Step 6!')
    }

    // 7. Test Navigation: Step 6 -> Step 5 (Stir module re-mounts clean)
    console.log('Navigating back to Step 5...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-step-back')?.click()`,
    })
    await sleep(400)

    const backStep5Check = await sendCommand('Runtime.evaluate', {
      expression: `
        JSON.stringify({
          hasStirModule: !!document.getElementById('stir-detection-module'),
          stirProgressPct: document.getElementById('stir-progress-pct')?.textContent?.trim()
        })
      `,
      returnByValue: true,
    })
    const backStep5State = JSON.parse(backStep5Check.result.value)
    console.log('Back to Step 5 State:', backStep5State)

    if (!backStep5State.hasStirModule) {
      throw new Error('#stir-detection-module failed to re-mount when navigating back to Step 5!')
    }
    if (!backStep5State.stirProgressPct.includes('0%')) {
      throw new Error('Stir progress should reset to 0% when navigating back to Step 5!')
    }

    // 8. Test Manual Fallback
    console.log('Testing manual completion fallback on Step 5...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.querySelector('.recipe-hud__done-badge')?.click()`,
    })
    await sleep(300)

    const manualDoneCheck = await sendCommand('Runtime.evaluate', {
      expression: `
        document.querySelector('.recipe-hud__done-badge')?.classList.contains('is-done')
      `,
      returnByValue: true,
    })
    if (!manualDoneCheck.result.value) {
      throw new Error('Manual completion fallback badge did not toggle to is-done!')
    }
    console.log('Manual completion fallback verified!')

    if (uncaughtErrors.length > 0) {
      throw new Error(`Uncaught browser errors occurred: ${uncaughtErrors.join('; ')}`)
    }

    console.log('\n========================================')
    console.log('PHASE 5 INTEGRATION TEST PASSED CLEANLY!')
    console.log('========================================\n')
  } finally {
    chromeProcess.kill()
  }
}

run().catch((err) => {
  console.error('\nTEST FAILED:', err)
  process.exit(1)
})
