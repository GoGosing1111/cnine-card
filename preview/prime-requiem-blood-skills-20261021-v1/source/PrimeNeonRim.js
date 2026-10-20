import {Filter,GlProgram} from 'pixi.js';

// Derive the rim from the already UV-clipped original sprite's alpha.
// The character pixels and proportions remain untouched. This pass contains
// only contour light, so it can sit in front of the surrounding blood ribbons.
const vertex=`
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(){
  vec2 position=aPosition*uOutputFrame.zw+uOutputFrame.xy;
  position.x=position.x*(2.0/uOutputTexture.x)-1.0;
  position.y=position.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
  gl_Position=vec4(position,0.0,1.0);
  vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);
}`;
const fragment=`
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uWidth;
float solid(vec2 uv){
  if(any(lessThan(uv,uInputClamp.xy))||any(greaterThan(uv,uInputClamp.zw)))return 0.0;
  return smoothstep(0.38,0.82,texture(uTexture,uv).a);
}
vec2 ring(float radius){
  float hi=0.0,lo=1.0;
  for(int i=0;i<12;i++){
    float a=float(i)*0.5235987756;
    float alpha=solid(vTextureCoord+vec2(cos(a),sin(a))*uInputSize.zw*radius);
    hi=max(hi,alpha);lo=min(lo,alpha);
  }
  return vec2(hi,lo);
}
void main(){
  float center=solid(vTextureCoord);
  vec2 close=ring(0.8);
  float hot=max(close.x-center,0.0);
  float inner=max(center-close.y,0.0);
  float edge=max(ring(uWidth).x-center,0.0);
  float halo=max(ring(uWidth*2.0).x-center,0.0)*0.24
    +max(ring(uWidth*3.8).x-center,0.0)*0.09;
  float alpha=clamp(edge*0.98+inner*0.58+halo,0.0,1.0);
  vec3 red=mix(vec3(1.0,0.008,0.035),vec3(1.0,0.28,0.15),max(hot,inner)*0.85);
  finalColor=vec4(red*alpha,alpha);
}`;

export class PrimeNeonRim extends Filter{
  constructor(){
    super({glProgram:GlProgram.from({name:'prime-requiem-alpha-neon-rim',vertex,fragment,
      preferredFragmentPrecision:'highp',preferredVertexPrecision:'highp'}),
    padding:14,resolution:'inherit',resources:{rimUniforms:{uWidth:{value:2.25,type:'f32'}}}});
  }
}
