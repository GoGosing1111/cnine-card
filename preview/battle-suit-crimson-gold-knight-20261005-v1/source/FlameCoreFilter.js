import {Filter,GlProgram} from 'pixi.js';

// Display-only: keep the approved 12-frame Valter texture/alpha untouched.
// Opaque red/gold flame material is separate from the additive outer light.
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
void main(){
 vec4 src=texture(uTexture,vTextureCoord);
 vec3 color=src.rgb/max(src.a,.00001);
 // Remove low-density haze from this material pass; the glow layer retains it.
 float alpha=smoothstep(.16,.72,src.a);
 finalColor=vec4(color*alpha,alpha);
}`;
export const makeFlameCoreFilter=()=>new Filter({glProgram:GlProgram.from({vertex,fragment,name:'overlord-flame-core-v6'}),padding:0});
