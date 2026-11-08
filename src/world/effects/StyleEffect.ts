import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector3 } from 'three'
import type { PostSettings } from '../style'
import { BLUR } from './DepthBlurEffect'

/**
 * The style's screen pass (wow-plan A3 / A4), ONE pass for everything:
 * - ink outlines where the depth jumps (object silhouettes against what is behind) — from the
 *   depth buffer the composer already has, so no extra scene render (no normal pass);
 *   relative threshold, so near and far edges look alike; faded with distance like fog;
 * - crease lines where a surface bends (box edges, a table top against its side): on any flat
 *   surface 1/depth changes linearly across the screen, so its second difference is ~0 —
 *   where it is not, the surface bends. Same 4 depth samples, no normals needed;
 * - colour grade: saturation, contrast, split toning (shadows / highlights tint), tint, vignette.
 * `mix` 0 = untouched picture. <Effects> raises it only after the 2D → 3D handover, so the swap
 * frame still matches the 2D page exactly.
 */
const fragmentShader = /* glsl */ `
  uniform float uMix;
  uniform float uOutline;        // sampling distance in px (0 = no outlines)
  uniform vec3 uOutlineColor;
  uniform float uOutlineStrength;
  uniform float uSaturation;
  uniform float uContrast;
  uniform vec3 uTint;
  uniform float uVignette;
  uniform float uCrease;         // strength of crease lines (0 = none)
  uniform vec3 uShadowTint;
  uniform vec3 uHighlightTint;
  uniform float uBlurMix;        // background blur (DepthBlurEffect): its lines soften too
  uniform float uBlurFocus;

  float viewDepth(const in vec2 uv) {
    return -getViewZ(readDepth(uv));
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    if (uMix <= 0.0) { outputColor = inputColor; return; }
    vec3 c = inputColor.rgb;

    // Grade.
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 g = mix(vec3(l), c, uSaturation);
    g = (g - 0.18) * uContrast + 0.18;
    g *= mix(uShadowTint, uHighlightTint, smoothstep(0.05, 0.8, l));
    g *= uTint;
    // Vignette: 0 at the centre, 1 at the corners, whatever the aspect ratio.
    vec2 q = (uv - 0.5) * vec2(aspect, 1.0);
    float r = length(q) / length(vec2(0.5 * aspect, 0.5));
    g *= 1.0 - uVignette * smoothstep(0.55, 1.0, r);

    // Outlines: biggest depth step to a neighbour, relative to the depth here.
    if (uOutline > 0.0) {
      float z = viewDepth(uv);
      vec2 o = texelSize * uOutline;
      float zr = viewDepth(uv + vec2(o.x, 0.0));
      float zl = viewDepth(uv - vec2(o.x, 0.0));
      float zu = viewDepth(uv + vec2(0.0, o.y));
      float zd = viewDepth(uv - vec2(0.0, o.y));
      float dz = max(max(abs(zr - z), abs(zl - z)), max(abs(zu - z), abs(zd - z)));
      float edge = smoothstep(0.04 * z + 0.02, 0.1 * z + 0.05, dz);
      // Crease: second difference of 1/depth, relative to 1/depth here.
      float iz = 1.0 / max(z, 1e-3);
      float bend = max(abs(1.0 / zr + 1.0 / zl - 2.0 * iz), abs(1.0 / zu + 1.0 / zd - 2.0 * iz)) / iz;
      float crease = smoothstep(0.004, 0.012, bend) * uCrease;
      edge = max(edge, crease);
      edge *= 1.0 - smoothstep(12.0, 40.0, z); // far lines would be noise
      // Sharp ink on a blurred background looks pasted on: soften the lines where it blurs.
      edge *= 1.0 - 0.85 * uBlurMix * clamp((z - uBlurFocus * (1.0 + ${BLUR.start.toFixed(3)})) / (uBlurFocus * ${BLUR.range.toFixed(3)}), 0.0, 1.0);
      g = mix(g, uOutlineColor, edge * uOutlineStrength);
    }

    outputColor = vec4(mix(c, max(g, 0.0), uMix), inputColor.a);
  }
`

export class StyleEffect extends Effect {
  constructor() {
    super('StyleEffect', fragmentShader, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uMix', new Uniform(0)],
        ['uOutline', new Uniform(0)],
        ['uOutlineColor', new Uniform(new Vector3())],
        ['uOutlineStrength', new Uniform(0)],
        ['uSaturation', new Uniform(1)],
        ['uContrast', new Uniform(1)],
        ['uTint', new Uniform(new Vector3(1, 1, 1))],
        ['uVignette', new Uniform(0)],
        ['uCrease', new Uniform(0)],
        ['uShadowTint', new Uniform(new Vector3(1, 1, 1))],
        ['uHighlightTint', new Uniform(new Vector3(1, 1, 1))],
        ['uBlurMix', new Uniform(0)],
        ['uBlurFocus', new Uniform(6)],
      ]),
    })
  }

  set mix(v: number) {
    this.uniforms.get('uMix')!.value = v
  }

  get mix(): number {
    return this.uniforms.get('uMix')!.value as number
  }

  /** Tell the outlines how the background blur stands (0 = no blur), so they soften with it. */
  setBlur(mix: number, focus: number) {
    this.uniforms.get('uBlurMix')!.value = mix
    this.uniforms.get('uBlurFocus')!.value = focus
  }

  /** Apply a style's post settings; `outlines` false (low quality) drops the outlines. */
  configure(post: PostSettings | null, outlines: boolean) {
    const u = (k: string) => this.uniforms.get(k)!
    if (!post) {
      u('uOutline').value = 0
      return
    }
    u('uOutline').value = outlines ? post.outline : 0
    ;(u('uOutlineColor').value as Vector3).set(...post.outlineColor)
    u('uOutlineStrength').value = post.outlineStrength
    u('uSaturation').value = post.saturation
    u('uContrast').value = post.contrast
    ;(u('uTint').value as Vector3).set(...post.tint)
    u('uVignette').value = post.vignette
    u('uCrease').value = post.crease
    ;(u('uShadowTint').value as Vector3).set(...post.shadowTint)
    ;(u('uHighlightTint').value as Vector3).set(...post.highlightTint)
  }
}
