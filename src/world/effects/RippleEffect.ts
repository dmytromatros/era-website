import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

/**
 * Screen-space "passing through water" ripple: a ring that expands from the pointer,
 * bending and splitting the colours of whatever is behind it.
 * Strength 0 = invisible (the pass still runs but is effectively a copy).
 */
const fragmentShader = /* glsl */ `
  uniform float uAge;      // seconds since the ripple started
  uniform float uAspect;
  uniform vec2 uCenter;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float fade = 1.0 - smoothstep(0.0, 1.6, uAge);
    if (fade <= 0.0) { outputColor = inputColor; return; }

    vec2 p = uv - uCenter;
    p.x *= uAspect;
    float d = length(p);
    float ring = uAge * 1.35;
    float wave = exp(-pow((d - ring) * 6.0, 2.0)) * fade;
    vec2 dir = d > 1e-4 ? p / d : vec2(0.0);
    dir.x /= uAspect;

    // The impact: for a split second the whole screen shudders like struck water.
    // It hides the swap and any tiny mismatch between the page and its 3D copy.
    float impact = exp(-uAge * 4.0);
    vec2 shudder = vec2(sin(uv.y * 24.0 + uAge * 30.0), sin(uv.x * 17.0 - uAge * 26.0)) * 0.012 * impact;

    vec2 offset = dir * wave * 0.07 - shudder;
    vec2 split = dir * (wave * 0.016 + impact * 0.006);
    float r = texture2D(inputBuffer, uv - offset + split).r;
    float g = texture2D(inputBuffer, uv - offset).g;
    float b = texture2D(inputBuffer, uv - offset - split).b;
    outputColor = vec4(r, g, b, inputColor.a);
  }
`

export class RippleEffect extends Effect {
  constructor() {
    super('RippleEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uAge', new Uniform(10)],
        ['uAspect', new Uniform(1)],
        ['uCenter', new Uniform(new Vector2(0.5, 0.5))],
      ]),
    })
  }

  set age(v: number) {
    this.uniforms.get('uAge')!.value = v
  }

  set aspect(v: number) {
    this.uniforms.get('uAspect')!.value = v
  }

  setCenter(x: number, y: number) {
    ;(this.uniforms.get('uCenter')!.value as Vector2).set(x, y)
  }
}
