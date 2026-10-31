import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9225

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run() {
  console.log('Inspecting live DOM structure of CookingScreen...')
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
      '--user-data-dir=' + path.join(os.tmpdir(), 'chrome-dom-profile-' + Date.now()),
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

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ')
        console.log(`[BROWSER CONSOLE] ${msg.params.type}: ${text}`)
        if (msg.params.stackTrace) {
          console.log(msg.params.stackTrace.callFrames.map(f => `  at ${f.functionName} (${f.url}:${f.lineNumber})`).join('\n'))
        }
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

    // Click Start Cooking
    await sendCommand('Runtime.evaluate', {
      expression: 'document.getElementById("btn-start-cooking").click()',
    })

    // Wait 3 seconds for AR to mount and initialize
    await sleep(3000)

    // Inspect DOM elements inside #ar-viewport and document
    const domInspection = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const vp = document.getElementById("ar-viewport");
        const allVideos = Array.from(document.querySelectorAll("video")).map(v => ({
          tagName: v.tagName,
          id: v.id,
          className: v.className,
          parentTag: v.parentElement ? v.parentElement.tagName : null,
          parentId: v.parentElement ? v.parentElement.id : null,
          parentClass: v.parentElement ? v.parentElement.className : null,
          style: v.getAttribute("style"),
          computedStyle: {
            display: getComputedStyle(v).display,
            visibility: getComputedStyle(v).visibility,
            opacity: getComputedStyle(v).opacity,
            zIndex: getComputedStyle(v).zIndex,
            position: getComputedStyle(v).position,
            width: getComputedStyle(v).width,
            height: getComputedStyle(v).height,
            top: getComputedStyle(v).top,
            left: getComputedStyle(v).left,
          },
          videoWidth: v.videoWidth,
          videoHeight: v.videoHeight,
          paused: v.paused,
          readyState: v.readyState,
          srcObject: !!v.srcObject
        }));

        const vpChildren = vp ? Array.from(vp.children).map(c => ({
          tagName: c.tagName,
          id: c.id,
          className: c.className,
          zIndex: getComputedStyle(c).zIndex,
          position: getComputedStyle(c).position,
          display: getComputedStyle(c).display,
          opacity: getComputedStyle(c).opacity
        })) : [];

        return {
          vpExists: !!vp,
          allVideosCount: allVideos.length,
          allVideos,
          vpChildren
        };
      })()`,
      returnByValue: true,
    })

    console.log('DOM Inspection Result:\n', JSON.stringify(domInspection.result.value, null, 2))
  } finally {
    chromeProcess.kill()
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
