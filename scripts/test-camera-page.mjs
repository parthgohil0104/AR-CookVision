import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9224

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run() {
  console.log('Testing camera-test.html via Headless Chrome...')
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
      '--user-data-dir=' + path.join(os.tmpdir(), 'chrome-diag-profile-' + Date.now()),
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  try {
    await sleep(1500)
    const newTargetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?https://localhost:5173/camera-test.html`, {
      method: 'PUT',
    })
    const target = await newTargetRes.json()
    const ws = new WebSocket(target.webSocketDebuggerUrl)

    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    const jsErrors = []
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.exceptionThrown') {
        jsErrors.push(msg.params.exceptionDetails)
      }
    }

    let id = 1
    function sendCommand(method, params = {}) {
      const msgId = id++
      return new Promise((resolve, reject) => {
        const handler = (event) => {
          const res = JSON.parse(event.data)
          if (res.id === msgId) {
            ws.removeEventListener('message', handler)
            if (res.error) reject(res.error)
            else resolve(res.result)
          }
        }
        ws.addEventListener('message', handler)
        ws.send(JSON.stringify({ id: msgId, method, params }))
      })
    }

    await sendCommand('Runtime.enable')
    await sendCommand('Page.enable')
    await sleep(1000)

    // Trigger Start Camera button
    await sendCommand('Runtime.evaluate', {
      expression: 'document.getElementById("btn-start").click()',
    })
    await sleep(2000)

    const diag = await sendCommand('Runtime.evaluate', {
      expression: `({
        readyState: document.getElementById("camera-feed").readyState,
        videoWidth: document.getElementById("camera-feed").videoWidth,
        videoHeight: document.getElementById("camera-feed").videoHeight,
        currentTime: document.getElementById("camera-feed").currentTime,
        paused: document.getElementById("camera-feed").paused,
        secure: document.getElementById("d-secure").innerText,
        errorVisible: document.getElementById("alert-error").style.display !== "none"
      })`,
      returnByValue: true,
    })

    console.log('Diagnostic result on localhost:', JSON.stringify(diag.result.value, null, 2))
    if (jsErrors.length > 0) {
      console.error('JS Errors found:', jsErrors)
    }
  } finally {
    chromeProcess.kill()
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
