import * as THREE from 'three'

/**
 * "Liquid glass" waves on the film (wow-plan D1): the pointer stirs it like water before the
 * visitor scrolls in, the palms send rings through it when they press. A height field
 * simulated on the GPU — two small ping-pong targets, one full-screen pass a step (the classic
 * height / velocity scheme: velocity pulled towards the neighbours' mean, damped). The film
 * (Membrane.tsx) reads the slope to bend and shade the dots behind the "glass".
 *
 * Cost: one draw call into a ≤ 256-cell target a step, and only while something moves (see
 * `wavesBusy`); idle, the field is cleared once and no step runs. `low` has no waves at all.
 */

/** Waves die out this long after the last stir (ms); the loop may park after that. */
export const WAVE_LIFE_MS = 2500
/** Steps a second (fixed, so the waves move at the same speed on any frame rate). */
const STEP_HZ = 60
const MAX_STEPS = 2
/** Velocity kept per step, height kept per step. */
const DAMP = 0.982
const HEIGHT_KEEP = 0.997
/** Stir radius (fraction of the domain height). */
const RADIUS = 0.035
export const MAX_STIRS = 4

/** Shared state: the pointer listener (FramePacer) and the film (Membrane) both use it. */
export const waves = {
  /** False on `low` (and before the film mounts): the pointer then wakes nothing. */
  enabled: false,
  /** performance.now() of the last stir. */
  lastInput: -Infinity,
}

export const noteWaveInput = (now: number) => {
  waves.lastInput = now
}

/** Is anything still moving on the film? */
export const wavesBusy = (now: number) => waves.enabled && now - waves.lastInput < WAVE_LIFE_MS

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uPrev;
  uniform vec2 uTexel;
  uniform float uAspect;
  uniform float uRadius;
  uniform vec4 uStir[${MAX_STIRS}];
  uniform float uAmp[${MAX_STIRS}];
  varying vec2 vUv;

  float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec4 c = texture2D(uPrev, vUv);
    float mean = 0.25 * (
      texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r + texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r +
      texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r + texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r);
    float v = (c.g + (mean - c.r) * 2.0) * ${DAMP.toFixed(4)};
    float h = (c.r + v) * ${HEIGHT_KEEP.toFixed(4)};
    // Stirs: the pointer's path since the last step, the palms.
    vec2 p = vec2(vUv.x * uAspect, vUv.y);
    for (int i = 0; i < ${MAX_STIRS}; i++) {
      vec2 a = vec2(uStir[i].x * uAspect, uStir[i].y);
      vec2 b = vec2(uStir[i].z * uAspect, uStir[i].w);
      float d = segment(p, a, b) / uRadius;
      h += uAmp[i] * exp(-d * d);
    }
    gl_FragColor = vec4(h, v, 0.0, 1.0);
  }
`

export class WaveSim {
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private material: THREE.ShaderMaterial
  private quad: THREE.Mesh
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  private stirs = 0
  private carry = 0
  private clean = true
  private clearColor = new THREE.Color()

  /** `cells` = cells along the longer side of the domain; `aspect` = domain width / height. */
  constructor(cells: number, aspect: number) {
    const [w, h] = WaveSim.size(cells, aspect)
    const make = () =>
      new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
      })
    this.targets = [make(), make()]
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPrev: { value: null },
        uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
        uAspect: { value: aspect },
        uRadius: { value: RADIUS },
        uStir: { value: Array.from({ length: MAX_STIRS }, () => new THREE.Vector4()) },
        uAmp: { value: new Array<number>(MAX_STIRS).fill(0) },
      },
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  static size(cells: number, aspect: number): [number, number] {
    return aspect >= 1 ? [cells, Math.max(8, Math.round(cells / aspect))] : [Math.max(8, Math.round(cells * aspect)), cells]
  }

  /** The current height field (r = height, g = velocity). */
  get texture() {
    return this.targets[0].texture
  }

  get texel(): THREE.Vector2 {
    return this.material.uniforms.uTexel!.value as THREE.Vector2
  }

  /** Stir along a segment (domain uv, 0..1) by `amp` (height, sign = up / down) for the next step. */
  stir(ax: number, ay: number, bx: number, by: number, amp: number) {
    if (this.stirs >= MAX_STIRS || amp === 0) return
    ;(this.material.uniforms.uStir!.value as THREE.Vector4[])[this.stirs]!.set(ax, ay, bx, by)
    ;(this.material.uniforms.uAmp!.value as number[])[this.stirs] = amp
    this.stirs++
  }

  /** Advance by `dt` seconds (fixed steps). Stirs go into the first step. */
  step(gl: THREE.WebGLRenderer, dt: number) {
    this.carry = Math.min(this.carry + dt, MAX_STEPS / STEP_HZ)
    const previous = gl.getRenderTarget()
    while (this.carry >= 1 / STEP_HZ - 1e-6) {
      this.carry -= 1 / STEP_HZ
      this.material.uniforms.uPrev!.value = this.targets[0].texture
      gl.setRenderTarget(this.targets[1])
      gl.render(this.scene, this.camera)
      this.targets.reverse()
      ;(this.material.uniforms.uAmp!.value as number[]).fill(0)
      this.stirs = 0
      this.clean = false
    }
    gl.setRenderTarget(previous)
  }

  /** Flat again (once, when the waves have died out) — the film is then exactly the 2D page. */
  clear(gl: THREE.WebGLRenderer) {
    if (this.clean) return
    const previous = gl.getRenderTarget()
    const alpha = gl.getClearAlpha()
    gl.getClearColor(this.clearColor)
    gl.setClearColor(0x000000, 0)
    for (const t of this.targets) {
      gl.setRenderTarget(t)
      gl.clear(true, false, false)
    }
    gl.setClearColor(this.clearColor, alpha)
    gl.setRenderTarget(previous)
    ;(this.material.uniforms.uAmp!.value as number[]).fill(0)
    this.stirs = 0
    this.carry = 0
    this.clean = true
  }

  dispose() {
    this.targets.forEach((t) => t.dispose())
    this.material.dispose()
    this.quad.geometry.dispose()
  }
}
