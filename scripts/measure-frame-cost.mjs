// Frame cost of era-website per quality level (docs/wow-plan.md, A1) — run before / after a
// wow-plan task and write the numbers into the plan's status table.
// Launches ONE headless Chrome (software WebGL), reads the ?debug=1 panel at several rail
// points of the home page for each level, and always kills Chrome (also on error / timeout).
// Needs the dev server on :3000 and Google Chrome in /Applications. In the Claude sandbox it
// must run outside the sandbox (Chrome can not start inside it).
// FPS here is software rendering — NOT representative; draw calls / triangles are.
// Usage: npm run measure -- <width> <height>    (default 1280 800)
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [W = '1280', H = '800'] = process.argv.slice(2)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333
const profile = mkdtempSync(join(tmpdir(), 'era-chrome-'))
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} ; try { rmSync(profile, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup)
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(1))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const killer = setTimeout(() => { console.error('timeout'); process.exit(2) }, 240000)

try {
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page') } catch {}
  }
  if (!target) throw new Error('no chrome target')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value

  await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: +W < 768 })
  // Rail points in scroll units (entrance = 1.6, src/world/timeline.ts ENTRANCE; the D1 hold is off).
  const points = [2.9, 10.5, 16.2, 18.8, 21.3]
  const results = {}
  for (const q of ['high', 'medium', 'low']) {
    await send('Page.navigate', { url: `http://localhost:3000/en?debug=1&quality=${q}` })
    await sleep(9000)
    results[q] = {}
    for (const u of points) {
      await evaluate(`(() => { const m = document.documentElement.scrollHeight - innerHeight; scrollTo(0, m * ${u} / 22.6) })()`)
      await sleep(5000)
      results[q][u] = await evaluate(`(document.querySelector('[data-debug-stats]')?.textContent || 'none') + ' | handover=' + document.documentElement.hasAttribute('data-handover')`)
    }
  }
  console.log(JSON.stringify(results, null, 1))
  ws.close()
} catch (e) {
  console.error('error', e)
  process.exitCode = 1
} finally {
  clearTimeout(killer)
  cleanup()
}
