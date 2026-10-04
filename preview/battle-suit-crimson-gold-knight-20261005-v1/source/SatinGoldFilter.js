import {Filter,GlProgram} from 'pixi.js';

// A display material pass: the approved PNGs, exact blade pixels and all pose geometry remain untouched.
const vertex=`
precision highp float;
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
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
vec3 straight(vec4 c){return c.rgb/max(c.a,.00001);}
float gold(vec3 c){
 return smoothstep(.035,.14,c.g-c.b)*smoothstep(-.01,.13,c.r-c.g)*smoothstep(.12,.38,c.r);
}
void main(){
 vec4 src=texture(uTexture,vTextureCoord);
 vec3 c=straight(src);
 vec2 px=uInputSize.zw*2.0;
 float nearby=0.0;
 nearby=max(nearby,gold(straight(texture(uTexture,vTextureCoord+vec2(px.x,0.0)))));
 nearby=max(nearby,gold(straight(texture(uTexture,vTextureCoord-vec2(px.x,0.0)))));
 nearby=max(nearby,gold(straight(texture(uTexture,vTextureCoord+vec2(0.0,px.y)))));
 nearby=max(nearby,gold(straight(texture(uTexture,vTextureCoord-vec2(0.0,px.y)))));
 nearby=max(nearby,gold(straight(texture(uTexture,vTextureCoord+px))));
 nearby=max(nearby,gold(straight(texture(uTexture,vTextureCoord-px))));
 float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b));
 float neutral=1.0-smoothstep(.10,.30,hi-lo);
 float pale=smoothstep(.47,.91,lo)*neutral;
 float metal=max(gold(c),nearby*pale*.98);
 float lum=dot(c,vec3(.2126,.7152,.0722));
 vec3 satin=vec3(.70,.51,.255)*(.32+.68*sqrt(clamp(lum,0.0,1.0)));
 // Warm midtones stay gold; white specular islands in gold neighborhoods become broad satin highlights.
 vec3 color=mix(c,satin,metal*smoothstep(.19,.62,lum)*.94);
 // Retain silver hair and cyan eyes while softening isolated chalk-white sparkles.
 color*=1.0-.15*pale*(1.0-metal);
 finalColor=vec4(color*src.a,src.a);
}`;
export const makeSatinGoldFilter=()=>new Filter({glProgram:GlProgram.from({vertex,fragment,name:'knight-satin-gold-v2'}),padding:0});
