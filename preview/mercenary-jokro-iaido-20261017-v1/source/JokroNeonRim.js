import {Filter,GlProgram} from 'pixi.js';
const vertex=`
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(){
 vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
 p.x=p.x*(2.0/uOutputTexture.x)-1.0;
 p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
 gl_Position=vec4(p,0.0,1.0);
 vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);
}`;
const fragment=`
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uStrength;
float alphaAt(vec2 p){return texture(uTexture,clamp(p,uInputClamp.xy,uInputClamp.zw)).a;}
void main(){
 vec4 c=texture(uTexture,vTextureCoord);
 float nearMax=0.0,nearMin=1.0,halo=0.0;
 for(int i=0;i<12;i++){
  float a=float(i)*0.5235987756;vec2 d=vec2(cos(a),sin(a))*uInputSize.zw;
  float n=alphaAt(vTextureCoord+d*1.25);nearMax=max(nearMax,n);nearMin=min(nearMin,n);
  halo+=alphaAt(vTextureCoord+d*3.5)*0.6+alphaAt(vTextureCoord+d*7.0)*0.4;
 }
 float outside=1.0-c.a,core=smoothstep(0.03,0.7,nearMax)*outside*0.92*uStrength;
 float bloom=halo/12.0*outside*0.48*uStrength;
 float inner=max(c.a-nearMin,0.0)*0.22*uStrength;
 vec3 rgb=mix(c.rgb,vec3(0.55,1.0,0.82)*c.a,inner);
 rgb+=vec3(0.56,1.0,0.84)*core+vec3(0.08,0.85,0.47)*bloom;
 finalColor=vec4(rgb,min(1.0,c.a+core+bloom));
}`;
// Screen-pixel alpha rim: the authored figure/katana pixels and silhouette
// stay intact. Only the transparent edge receives a narrow mint core and halo.
export class JokroNeonRim extends Filter {
 constructor(){super({glProgram:GlProgram.from({name:'jokro-neon-rim',vertex,fragment,preferredFragmentPrecision:'highp',preferredVertexPrecision:'highp'}),padding:10,resolution:'inherit',resources:{rimUniforms:{uStrength:{value:1,type:'f32'}}}});}
 set strength(value){this.resources.rimUniforms.uniforms.uStrength=value;}
 get strength(){return this.resources.rimUniforms.uniforms.uStrength;}
}
