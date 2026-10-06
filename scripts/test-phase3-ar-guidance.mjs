import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9227

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run() {
  console.log('Testing Phase 3 AR Cooking Guidance on https://localhost:5173/ ...')
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
      '--user-data-dir=' + path.join(os.tmpdir(), 'chrome-p3-' + Date.now()),
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

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ')
        console.log(`[BROWSER CONSOLE] ${msg.params.type}: ${text}`)
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.log(`[BROWSER EXCEPTION]`, JSON.stringify(msg.params.exceptionDetails))
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

    await sleep(2500)

    // Click "Start Cooking" on StartScreen
    console.log('Clicking Start Cooking button...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-start-cooking')?.click()`,
    })

    await sleep(2500)

    // Helper to inspect 3D AR guidance state
    async function getGuidanceState() {
      const res = await sendCommand('Runtime.evaluate', {
        expression: `JSON.stringify({
          hasARGuidance: !!window.__arGuidance,
          activeStep: window.__arGuidance?.activeStep,
          isCompleted: window.__arGuidance?.isCompleted,
          stepVisibilities: [1, 2, 3, 4, 5, 6, 7].map(s => window.__arGuidance?.stepGroups[s]?.visible),
          completionVisible: window.__arGuidance?.completionGroup?.visible,
          hudStepIndicator: document.getElementById('step-indicator')?.innerText,
          hudTitle: document.getElementById('step-title')?.innerText,
        })`,
        returnByValue: true,
      })
      return JSON.parse(res.result.value)
    }

    // Wait for AR engine to initialize and mount 3D guidance
    console.log('Waiting for AR guidance initialization...')
    let step1 = null
    for (let i = 0; i < 20; i++) {
      step1 = await getGuidanceState()
      if (step1.hasARGuidance) break
      await sleep(500)
    }

    console.log('Step 1 AR Guidance Verification:', step1)

    if (!step1.hasARGuidance || step1.activeStep !== 1) {
      throw new Error(`Expected activeStep 1 in AR Guidance, got ${step1.activeStep}`)
    }
    if (!step1.stepVisibilities[0]) {
      throw new Error('Expected Step 1 group to be visible')
    }
    for (let i = 1; i < 7; i++) {
      if (step1.stepVisibilities[i]) {
        throw new Error(`Step ${i + 1} group must not be visible on Step 1`)
      }
    }

    // 2. Walk forward through steps 2 to 7 and verify 3D AR guidance updates at each step
    const stepTitles = [
      'Position pan',
      'Add oil',
      'Add eggs',
      'Add salt',
      'Stir',
      'Cook',
      'Serve',
    ]

    for (let s = 2; s <= 7; s++) {
      console.log(`Advancing to Step ${s} (${stepTitles[s - 1]})...`)
      await sendCommand('Runtime.evaluate', {
        expression: `document.getElementById('btn-step-next')?.click()`,
      })
      await sleep(400)

      const st = await getGuidanceState()
      console.log(`Step ${s} AR Guidance:`, {
        activeStep: st.activeStep,
        stepVisibility: st.stepVisibilities[s - 1],
        hudTitle: st.hudTitle,
      })

      if (st.activeStep !== s) {
        throw new Error(`Expected activeStep ${s}, got ${st.activeStep}`)
      }
      if (!st.stepVisibilities[s - 1]) {
        throw new Error(`Expected Step ${s} group to be visible in AR guidance`)
      }
      // Check no other step is visible
      for (let j = 0; j < 7; j++) {
        if (j !== s - 1 && st.stepVisibilities[j]) {
          throw new Error(`Step ${j + 1} group leaked visible on Step ${s}!`)
        }
      }
    }

    // 3. Test Backward Navigation synchronization (Step 7 -> Step 6 -> Step 5)
    console.log('Testing Backward navigation (Step 7 -> Step 6)...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-step-back')?.click()`,
    })
    await sleep(300)

    const back6 = await getGuidanceState()
    console.log('Back to Step 6 AR Guidance:', { activeStep: back6.activeStep, hudTitle: back6.hudTitle })
    if (back6.activeStep !== 6 || !back6.stepVisibilities[5]) {
      throw new Error(`Expected Step 6 guidance after Back, got ${back6.activeStep}`)
    }

    // Advance back to Step 7
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-step-next')?.click()`,
    })
    await sleep(300)

    // 4. Test Recipe Completion celebration AR guidance
    console.log('Finishing recipe on Step 7...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-step-next')?.click()`,
    })
    await sleep(500)

    const completionState = await getGuidanceState()
    console.log('Completion AR Guidance State:', {
      isCompleted: completionState.isCompleted,
      completionVisible: completionState.completionVisible,
      stepVisibilities: completionState.stepVisibilities,
    })

    if (!completionState.isCompleted || !completionState.completionVisible) {
      throw new Error('Expected celebratory completion AR guidance upon completing recipe')
    }
    // Verify all 7 regular steps are hidden
    for (let j = 0; j < 7; j++) {
      if (completionState.stepVisibilities[j]) {
        throw new Error(`Step ${j + 1} was still visible during completion!`)
      }
    }

    // 5. Test Recipe Reset returns to Step 1 AR Guidance
    console.log('Clicking Cook Again (Reset)...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-cook-again')?.click()`,
    })
    await sleep(400)

    const resetState = await getGuidanceState()
    console.log('Reset AR Guidance State:', {
      activeStep: resetState.activeStep,
      isCompleted: resetState.isCompleted,
      step1Visible: resetState.stepVisibilities[0],
      completionVisible: resetState.completionVisible,
    })

    if (resetState.activeStep !== 1 || !resetState.stepVisibilities[0] || resetState.completionVisible) {
      throw new Error('Expected clean reset back to Step 1 pan guidance')
    }

    console.log('\n=== ALL PHASE 3 AR COOKING GUIDANCE INTEGRATION CHECKS PASSED! ===\n')
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
