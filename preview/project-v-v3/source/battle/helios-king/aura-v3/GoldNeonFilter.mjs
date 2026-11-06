import {Filter,GlProgram} from 'pixi.js';
// Applied only to the current Spine alpha silhouette. Opaque art stays intact.
const vertex=`precision highp float;
in vec2 aPosition;out vec2 vTextureCoord;
uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;
void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0.0,1.0);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);}`;
const fragment=`precision highp float;
in vec2 vTextureCoord;out vec4 finalColor;
uniform sampler2D uTexture;uniform vec4 uInputSize;uniform vec4 uInputClamp;
uniform float uWidth;uniform float uGlow;
float alphaAt(vec2 offset){vec2 uv=vTextureCoord+offset*uInputSize.zw;if(any(lessThan(uv,uInputClamp.xy))||any(greaterThan(uv,uInputClamp.zw)))return 0.0;return texture(uTexture,uv).a;}
void main(){vec4 art=texture(uTexture,vTextureCoord);float edge=0.0,nearGlow=0.0,farGlow=0.0;
for(int i=0;i<12;i++){float angle=float(i)*.5235987756;vec2 d=vec2(cos(angle),sin(angle));edge=max(edge,alphaAt(d*uWidth));nearGlow+=alphaAt(d*(uWidth+1.8));farGlow+=alphaAt(d*(uWidth+4.5));}
float halo=(nearGlow/12.0*.54+farGlow/12.0*.22)*uGlow;
float light=(1.0-art.a)*max(edge*.95,halo);
vec3 gold=mix(vec3(1.0,.48,.035),vec3(1.0,.86,.35),edge);
finalColor=art+vec4(gold*light,light);}`;
export class GoldNeonFilter extends Filter{
 constructor(){super({glProgram:GlProgram.from({vertex,fragment,name:'helios-gold-silhouette-v3'}),padding:11,resolution:1,resources:{neonUniforms:{uWidth:{value:.90,type:'f32'},uGlow:{value:1,type:'f32'}}}});}
 setGlow(value){this.resources.neonUniforms.uniforms.uGlow=value;}
}
