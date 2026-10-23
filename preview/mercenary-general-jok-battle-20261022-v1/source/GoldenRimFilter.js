import {Filter,GlProgram} from 'pixi.js';

// Render-time edge lighting from the currently displayed sprite alpha.
// The original figure, pixels, proportions and pose textures remain untouched.
const vertex="\nin vec2 aPosition;\nout vec2 vTextureCoord;\nuniform vec4 uInputSize;\nuniform vec4 uOutputFrame;\nuniform vec4 uOutputTexture;\nvoid main(){\n vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;\n p.x=p.x*(2.0/uOutputTexture.x)-1.0;\n p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;\n gl_Position=vec4(p,0.0,1.0);\n vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);\n}";
const fragment="\nin vec2 vTextureCoord;\nout vec4 finalColor;\nuniform sampler2D uTexture;\nuniform vec4 uInputSize;\nuniform vec4 uInputClamp;\nuniform float uStrength;\nuniform float uRadius;\nfloat opacityAt(vec2 d){return texture(uTexture,clamp(vTextureCoord+d,uInputClamp.xy,uInputClamp.zw)).a;}\nvoid main(){\n vec4 original=texture(uTexture,vTextureCoord);\n float edge=0.0;\n float soft=0.0;\n for(int i=0;i<12;i++){\n  float angle=float(i)*0.5235987756;\n  vec2 d=vec2(cos(angle),sin(angle))*uInputSize.zw;\n  edge=max(edge,opacityAt(d*uRadius));\n  soft+=opacityAt(d*uRadius*3.5)*0.055;\n  soft+=opacityAt(d*uRadius*1.9)*0.028;\n }\n float line=clamp((edge-original.a)*uStrength,0.0,1.0);\n float haze=clamp((soft-original.a)*uStrength*0.72,0.0,0.65);\n float glow=max(line,haze);\n vec3 color=mix(vec3(1.0,0.48,0.035),vec3(1.0,0.91,0.40),line);\n finalColor=original+vec4(color*glow,glow)*(1.0-original.a);\n}";
export class GoldenRimFilter extends Filter{
 constructor(){super({glProgram:GlProgram.from({name:'general-jok-golden-neon-rim',vertex,fragment,preferredFragmentPrecision:'highp'}),padding:22,resolution:'inherit',resources:{rimUniforms:{uStrength:{value:1.2,type:'f32'},uRadius:{value:1.7,type:'f32'}}}});}
 get strength(){return this.resources.rimUniforms.uniforms.uStrength;}
 set strength(value){this.resources.rimUniforms.uniforms.uStrength=value;}
}
