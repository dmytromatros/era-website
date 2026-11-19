/**
 * The canvas's height, steady on a phone (Dima 2026-11-19: on a phone the office's people "kept
 * changing" while scrolling up and down).
 *
 * A phone's browser hides its address bar as you scroll down and shows it again as you scroll up:
 * `innerHeight` changes by 60–100 px and `resize` fires. When the canvas followed it (`inset: 0`),
 * every such change rebuilt the whole world — the layout depends on the frame's aspect — and with
 * it the office's people (another deal), the props (pushed balls back on their spots) and a CPU
 * spike. So the canvas is the *large* viewport (`100lvh`, Scene.module.css): the same with the bar
 * shown or hidden, which then just covers the canvas's bottom. On a desktop `lvh` = `innerHeight`,
 * so a real window resize still rebuilds as before.
 *
 * Read with a hidden probe of that same height (cached; re-read on `resize`).
 */
let probe: HTMLDivElement | null = null
let cached = 0

function read(): number {
  if (typeof document === 'undefined') return 0
  if (!probe) {
    if (!CSS.supports('height', '100lvh')) return window.innerHeight
    probe = document.createElement('div')
    probe.setAttribute('aria-hidden', '')
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none'
    document.body.appendChild(probe)
    window.addEventListener('resize', () => {
      cached = 0
    })
  }
  return probe.offsetHeight || window.innerHeight
}

/** The canvas's height in CSS px: the large viewport (does not change with a phone's address bar). */
export function canvasHeight(): number {
  if (!cached) cached = read()
  return cached
}
