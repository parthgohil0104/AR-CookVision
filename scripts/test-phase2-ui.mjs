import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9226

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run() {
  console.log('Testing Phase 2 Recipe Engine UI on https://localhost:5173/ ...')
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
      '--user-data-dir=' + path.join(os.tmpdir(), 'chrome-p2-' + Date.now()),
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

    await sleep(2000)

    // Verify Step 1 UI
    const step1Check = await sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify({
        hasCookingScreen: !!document.getElementById('cooking-screen'),
        hasRecipeHUD: !!document.getElementById('recipe-hud'),
        topStepIndicator: document.getElementById('step-indicator')?.innerText,
        stepTitle: document.getElementById('step-title')?.innerText,
        stepInstruction: document.getElementById('step-instruction')?.innerText?.slice(0, 40),
        backBtnDisabled: document.getElementById('btn-step-back')?.disabled,
        pillsCount: document.querySelectorAll('.step-pill')?.length,
        hasTimer: !!document.getElementById('step-timer-module'),
      })`,
      returnByValue: true,
    })

    const step1Data = JSON.parse(step1Check.result.value)
    console.log('Step 1 Verification:', step1Data)

    if (step1Data.topStepIndicator !== 'Step 1 / 7') {
      throw new Error(`Expected Step 1 / 7 but got ${step1Data.topStepIndicator}`)
    }
    if (step1Data.stepTitle !== 'Position pan') {
      throw new Error(`Expected 'Position pan' but got ${step1Data.stepTitle}`)
    }
    if (!step1Data.backBtnDisabled) {
      throw new Error('Expected Back button to be disabled on Step 1')
    }

    // Advance to Step 2
    console.log('Clicking Next Step button...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-step-next')?.click()`,
    })
    await sleep(500)

    const step2Check = await sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify({
        topStepIndicator: document.getElementById('step-indicator')?.innerText,
        stepTitle: document.getElementById('step-title')?.innerText,
        backBtnDisabled: document.getElementById('btn-step-back')?.disabled,
        hasTimer: !!document.getElementById('step-timer-module'),
        timerDisplay: document.getElementById('timer-display')?.innerText,
        progressPct: document.querySelector('.recipe-hud__progress-pct')?.innerText,
      })`,
      returnByValue: true,
    })

    const step2Data = JSON.parse(step2Check.result.value)
    console.log('Step 2 Verification:', step2Data)

    if (step2Data.topStepIndicator !== 'Step 2 / 7') {
      throw new Error(`Expected Step 2 / 7 but got ${step2Data.topStepIndicator}`)
    }
    if (step2Data.stepTitle !== 'Add oil') {
      throw new Error(`Expected 'Add oil' but got ${step2Data.stepTitle}`)
    }
    if (!step2Data.hasTimer || step2Data.timerDisplay !== '00:30') {
      throw new Error(`Expected timer 00:30 on Step 2, got ${step2Data.timerDisplay}`)
    }

    // Start timer on Step 2
    console.log('Testing Step 2 timer start...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-timer-start')?.click()`,
    })
    await sleep(1500)

    const timerRunningCheck = await sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify({
        timerDisplay: document.getElementById('timer-display')?.innerText,
        hasPauseBtn: !!document.getElementById('btn-timer-pause'),
      })`,
      returnByValue: true,
    })
    const timerRunningData = JSON.parse(timerRunningCheck.result.value)
    console.log('Timer Running Verification:', timerRunningData)

    if (timerRunningData.timerDisplay === '00:30') {
      console.warn('Timer might not have ticked yet, waiting 1s more...')
      await sleep(1000)
    }

    // Pause timer
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-timer-pause')?.click()`,
    })
    await sleep(300)

    // Click Back to Step 1
    console.log('Testing Back button navigation...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-step-back')?.click()`,
    })
    await sleep(400)

    const backCheck = await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('step-title')?.innerText`,
      returnByValue: true,
    })
    console.log('Back to Step 1 Verification:', backCheck.result.value)
    if (backCheck.result.value !== 'Position pan') {
      throw new Error(`Expected Step 1 'Position pan', got ${backCheck.result.value}`)
    }

    // Advance through steps 2, 3, 4, 5, 6, 7
    console.log('Navigating forward through remaining steps...')
    for (let s = 2; s <= 7; s++) {
      await sendCommand('Runtime.evaluate', {
        expression: `document.getElementById('btn-step-next')?.click()`,
      })
      await sleep(300)
    }

    const step7Check = await sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify({
        topStepIndicator: document.getElementById('step-indicator')?.innerText,
        stepTitle: document.getElementById('step-title')?.innerText,
        nextBtnText: document.getElementById('btn-step-next')?.innerText,
      })`,
      returnByValue: true,
    })
    const step7Data = JSON.parse(step7Check.result.value)
    console.log('Step 7 Verification:', step7Data)

    if (step7Data.stepTitle !== 'Serve') {
      throw new Error(`Expected 'Serve' on step 7, got ${step7Data.stepTitle}`)
    }

    // Complete recipe
    console.log('Clicking Finish Omelette button...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-step-next')?.click()`,
    })
    await sleep(500)

    const completeCheck = await sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify({
        hasCompletionModal: !!document.getElementById('recipe-completed-modal'),
        completionTitle: document.querySelector('.recipe-completion__title')?.innerText,
      })`,
      returnByValue: true,
    })
    const completeData = JSON.parse(completeCheck.result.value)
    console.log('Completion Modal Verification:', completeData)

    if (!completeData.hasCompletionModal) {
      throw new Error('Expected recipe completion modal to be visible')
    }

    // Test Cook Again (Reset)
    console.log('Clicking Cook Again (Reset) button...')
    await sendCommand('Runtime.evaluate', {
      expression: `document.getElementById('btn-cook-again')?.click()`,
    })
    await sleep(400)

    const resetCheck = await sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify({
        topStepIndicator: document.getElementById('step-indicator')?.innerText,
        stepTitle: document.getElementById('step-title')?.innerText,
        hasModal: !!document.getElementById('recipe-completed-modal'),
      })`,
      returnByValue: true,
    })
    const resetData = JSON.parse(resetCheck.result.value)
    console.log('Reset Verification:', resetData)

    if (resetData.topStepIndicator !== 'Step 1 / 7' || resetData.hasModal) {
      throw new Error('Expected clean reset back to Step 1 without modal')
    }

    console.log('\n=== ALL PHASE 2 UI TESTS PASSED SUCCESSFULLY! ===\n')
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
