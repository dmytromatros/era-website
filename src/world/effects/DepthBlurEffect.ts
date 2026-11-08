import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform } from 'three'

/**
 * Soft background blur — the "depth of field" of task B3, in ONE screen pass.
 *
 * The camera focuses on what it looks at (at a stop: the exhibit — cinema.ts `cameraFocus`).
 * Only what lies BEHIND the focus blurs, growing with distance: a disc of TAPS samples
 * (golden-angle spiral) around the pixel. Samples that are themselves in focus (a sharp card
 * edge next to the far background) get no weight, so sharp things never bleed into the blur.
 *
 * Why not postprocessing's DepthOfFieldEffect: it renders ~9 extra passes (circle of
 * confusion, Kawase blur, mask, near/far bokeh). Here it is one convolution effect that shares
 * the depth buffer and merges with the style pass (it goes first, so the grade and outlines
 * are drawn over the blurred picture; StyleEffect softens its lines with the same focus).
 */
export const BLUR = {
  /** Blur starts this far behind the focus (fraction of the focus distance)… */
  start: 0.15,
  /** …and is full this much further (fraction of the focus distance). */
  range: 1.35,
  /** Largest blur radius, CSS pixels (scaled by the device pixel ratio). */
  radius: 5,
} as const

const fragmentShader = /* glsl */ `
  uniform float uMix;
  uniform float uFocus;   // view distance in focus
  uniform float uRadius;  // full blur radius in buffer pixels

  float blurAmount(const in vec2 uv) {
    float z = -getViewZ(readDepth(uv));
    return clamp((z - uFocus * (1.0 + ${BLUR.start.toFixed(3)})) / (uFocus * ${BLUR.range.toFixed(3)}), 0.0, 1.0);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    float c = uMix * blurAmount(uv);
    if (c < 0.02) { outputColor = inputColor; return; }
    vec3 sum = inputColor.rgb;
    float total = 1.0;
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i) + 0.5;
      float r = sqrt(fi / float(TAPS));
      float a = fi * 2.39996323;
      vec2 s = uv + vec2(cos(a), sin(a)) * (r * c * uRadius) * texelSize;
      // Sharp (in-focus) samples do not spill into the background.
      float w = clamp(blurAmount(s) * 4.0, 0.0, 1.0);
      sum += texture2D(inputBuffer, s).rgb * w;
      total += w;
    }
    outputColor = vec4(sum / total, inputColor.a);
  }
`

export class DepthBlurEffect extends Effect {
  /** `taps`: samples per pixel (QUALITY.depthBlur) — fixed per instance, it is a shader constant. */
  constructor(taps: number) {
    super('DepthBlurEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      blendFunction: BlendFunction.NORMAL,
      defines: new Map([['TAPS', String(taps)]]),
      uniforms: new Map<string, Uniform>([
        ['uMix', new Uniform(0)],
        ['uFocus', new Uniform(6)],
        ['uRadius', new Uniform(BLUR.radius)],
      ]),
    })
  }

  set mix(v: number) {
    this.uniforms.get('uMix')!.value = v
  }

  set focus(v: number) {
    this.uniforms.get('uFocus')!.value = v
  }

  set radius(px: number) {
    this.uniforms.get('uRadius')!.value = px
  }
}
