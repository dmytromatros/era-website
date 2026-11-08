import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector3 } from 'three'
import type { PostSettings } from '../style'

/**
 * The style's screen pass (wow-plan A3 / A4), ONE pass for everything:
 * - ink outlines where the depth jumps (object silhouettes against what is behind) — from the
 *   depth buffer the composer already has, so no extra scene render (no normal pass);
 *   relative threshold, so near and far edges look alike; faded with distance like fog;
 * - colour grade: saturation, contrast, tint, vignette.
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
    g *= uTint;
    // Vignette: 0 at the centre, 1 at the corners, whatever the aspect ratio.
    vec2 q = (uv - 0.5) * vec2(aspect, 1.0);
    float r = length(q) / length(vec2(0.5 * aspect, 0.5));
    g *= 1.0 - uVignette * smoothstep(0.55, 1.0, r);

    // Outlines: biggest depth step to a neighbour, relative to the depth here.
    if (uOutline > 0.0) {
      float z = viewDepth(uv);
      vec2 o = texelSize * uOutline;
      float dz = max(
        max(abs(viewDepth(uv + vec2(o.x, 0.0)) - z), abs(viewDepth(uv - vec2(o.x, 0.0)) - z)),
        max(abs(viewDepth(uv + vec2(0.0, o.y)) - z), abs(viewDepth(uv - vec2(0.0, o.y)) - z))
      );
      float edge = smoothstep(0.04 * z + 0.02, 0.1 * z + 0.05, dz);
      edge *= 1.0 - smoothstep(12.0, 40.0, z); // far lines would be noise
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
      ]),
    })
  }

  set mix(v: number) {
    this.uniforms.get('uMix')!.value = v
  }

  get mix(): number {
    return this.uniforms.get('uMix')!.value as number
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
  }
}
