// Share the deployed renderer's shader registry; do not bundle another Pixi copy.
const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 p = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  p.x = p.x * (2.0 / uOutputTexture.x) - 1.0;
  p.y = p.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(p, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;
const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uRadius;
uniform float uStrength;
uniform float uOpacity;
uniform float uHaloStrength;
float opacityAt(vec2 offset) {
  vec2 uv = vTextureCoord + offset;
  if (any(lessThan(uv, uInputClamp.xy)) || any(greaterThan(uv, uInputClamp.zw))) return 0.0;
  return texture(uTexture, uv).a;
}
void main() {
  vec4 original = texture(uTexture, vTextureCoord);
  float edge = 0.0;
  float halo = 0.0;
  for (int i = 0; i < 12; i++) {
    float angle = float(i) * 0.5235987756;
    vec2 direction = vec2(cos(angle), sin(angle)) * uInputSize.zw;
    edge = max(edge, opacityAt(direction * uRadius));
    halo += opacityAt(direction * uRadius * 2.0) * 0.035;
    halo += opacityAt(direction * uRadius * 3.4) * 0.020;
  }
  float line = clamp((edge - original.a) * uStrength, 0.0, 1.0);
  float haze = clamp((halo - original.a) * 0.9, 0.0, 0.38) * uHaloStrength;
  float coverage = max(line, haze) * uOpacity;
  vec3 violet = mix(vec3(0.57, 0.0, 1.0), vec3(0.82, 0.18, 1.0), line);
  finalColor = original + vec4(violet * coverage, coverage) * (1.0 - original.a);
}`;

export function createNeonPurpleRim(stage, runtime = {}, spec = {}) {
  let {Filter, GlProgram} = runtime;
  if (!Filter || !GlProgram) {
    const queue = [stage];
    let native;
    while (queue.length && !native) {
      const node = queue.shift();
      native = node?.filters?.find(filter => filter.blurXFilter?.glProgram);
      if (node?.children) queue.push(...node.children);
    }
    if (!native) throw Error('흑무 외곽선에 필요한 V3 필터를 찾을 수 없습니다.');
    Filter = Object.getPrototypeOf(Object.getPrototypeOf(native)).constructor;
    GlProgram = native.blurXFilter.glProgram.constructor;
  }
  return new Filter({
    glProgram: GlProgram.from({name: 'heukmu-neon-purple-rim-v2', vertex, fragment, preferredFragmentPrecision: 'highp'}),
    padding: 10,
    resolution: 'inherit',
    resources: {rimUniforms: {
      uRadius: {value: spec.radius ?? 1.6, type: 'f32'},
      uStrength: {value: spec.strength ?? 2.3, type: 'f32'},
      uOpacity: {value: spec.opacity ?? 1, type: 'f32'},
      uHaloStrength: {value: spec.haloStrength ?? 1, type: 'f32'}
    }}
  });
}
