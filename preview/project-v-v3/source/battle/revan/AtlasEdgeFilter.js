import {Filter,GlProgram} from 'pixi.js';
// Render-only soft gutters remove rectangular cuts in an effect cell. PNGs,
// the character, and the fixed sword texture remain byte-for-byte untouched.
const vertex=`
in vec2 aPosition;out vec2 vTextureCoord;
uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;
void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0.,1.);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);}`;
const fragment=`
in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;uniform vec4 uInputClamp;
void main(){vec2 uv=(vTextureCoord-uInputClamp.xy)/max(uInputClamp.zw-uInputClamp.xy,vec2(.0001));float fade=smoothstep(0.,.13,uv.x)*smoothstep(0.,.13,1.-uv.x)*smoothstep(0.,.06,uv.y)*smoothstep(0.,.06,1.-uv.y);finalColor=texture(uTexture,vTextureCoord)*fade;}`;
export class AtlasEdgeFilter extends Filter{constructor(){super({glProgram:GlProgram.from({name:'revan-atlas-soft-gutters',vertex,fragment}),padding:0,resolution:'inherit'})}}
