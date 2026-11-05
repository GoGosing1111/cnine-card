import {Filter,GlProgram} from 'pixi.js';

const vertex=`
precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
 vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
 p.x=p.x*(2.0/uOutputTexture.x)-1.0;
 p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
 gl_Position=vec4(p,0.0,1.0);
 vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);
}`;
const fragment=`
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uWidth;
uniform float uGlow;
float alphaAt(vec2 offset) {
 vec2 uv=vTextureCoord+offset*uInputSize.zw;
 if(any(lessThan(uv,uInputClamp.xy))||any(greaterThan(uv,uInputClamp.zw)))return 0.0;
 return texture(uTexture,uv).a;
}
void main() {
 vec4 art=texture(uTexture,vTextureCoord);
 float edge=0.0,inner=0.0,outer=0.0;
 for(int i=0;i<12;i++) {
  float angle=float(i)*0.5235987756;
  vec2 d=vec2(cos(angle),sin(angle));
  edge=max(edge,alphaAt(d*uWidth));
  inner+=alphaAt(d*(uWidth+2.0));
  outer+=alphaAt(d*(uWidth+5.0));
 }
 // Place premultiplied white emission BEHIND the current alpha silhouette.
 // Fully opaque face, costume and blade pixels retain their original colour.
 float halo=(inner/12.0*.48+outer/12.0*.20)*uGlow;
 float light=(1.0-art.a)*max(edge*.95,halo);
 finalColor=art+vec4(vec3(.96,.985,1.0)*light,light);
}`;

export class WhiteOutlineFilter extends Filter {
 constructor(){super({glProgram:GlProgram.from({vertex,fragment,name:'hakuya-white-silhouette'}),padding:10,resolution:1,resources:{outlineUniforms:{uWidth:{value:1.35,type:'f32'},uGlow:{value:1,type:'f32'}}}});}
 setGlow(value){this.resources.outlineUniforms.uniforms.uGlow=value;}
}
