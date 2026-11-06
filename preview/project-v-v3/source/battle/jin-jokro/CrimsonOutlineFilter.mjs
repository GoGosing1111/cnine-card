import {Filter,GlProgram} from 'pixi.js';

const vertex=`
precision highp float;
in vec2 aPosition;out vec2 vTextureCoord;
uniform vec4 uInputSize,uOutputFrame,uOutputTexture;
void main(){
 vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
 p.x=p.x*(2.0/uOutputTexture.x)-1.0;
 p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
 gl_Position=vec4(p,0.0,1.0);
 vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);
}`;
const fragment=`
precision highp float;
in vec2 vTextureCoord;out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize,uInputClamp;
uniform float uWidth,uGlow;
float alphaAt(vec2 d){
 vec2 uv=vTextureCoord+d*uInputSize.zw;
 if(any(lessThan(uv,uInputClamp.xy))||any(greaterThan(uv,uInputClamp.zw)))return 0.0;
 return texture(uTexture,uv).a;
}
void main(){
 vec4 art=texture(uTexture,vTextureCoord);
 float edge=0.0,nearGlow=0.0,farGlow=0.0;
 for(int i=0;i<12;i++){
  float a=float(i)*0.5235987756;vec2 d=vec2(cos(a),sin(a));
  edge=max(edge,alphaAt(d*uWidth));
  nearGlow+=alphaAt(d*(uWidth+2.0));
  farGlow+=alphaAt(d*(uWidth+5.0));
 }
 float halo=(nearGlow/12.0*.65+farGlow/12.0*.25)*uGlow;
 float emission=(1.0-art.a)*max(edge*.91,halo);
 // Premultiplied emission behind the animated silhouette. The face, costume
 // and steel keep their authored colour; the HUD is outside this filter.
 finalColor=art+vec4(vec3(1.0,.009,.012)*emission,emission);
}`;
export class CrimsonOutlineFilter extends Filter{
 constructor(){super({glProgram:GlProgram.from({vertex,fragment,name:'jokro-crimson-neon'}),padding:10,resolution:1,resources:{outlineUniforms:{uWidth:{value:1.15,type:'f32'},uGlow:{value:1,type:'f32'}}}});}
 setGlow(value){this.resources.outlineUniforms.uniforms.uGlow=value;}
}
