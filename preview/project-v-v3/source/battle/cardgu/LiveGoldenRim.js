// Reuse the approved General Jok rim shader with the CURRENT renderer's native
// Filter/GlProgram constructors. A second Pixi module has a separate program-ID
// registry and can silently collide with the deployed renderer's shader cache.
const vertex=`
in vec2 aPosition;out vec2 vTextureCoord;
uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;
void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0.0,1.0);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);}`;
const fragment=`
in vec2 vTextureCoord;out vec4 finalColor;
uniform sampler2D uTexture;uniform vec4 uInputSize;uniform vec4 uInputClamp;uniform float uStrength;uniform float uRadius;
float opacityAt(vec2 d){return texture(uTexture,clamp(vTextureCoord+d,uInputClamp.xy,uInputClamp.zw)).a;}
void main(){vec4 original=texture(uTexture,vTextureCoord);float edge=0.0;float soft=0.0;
for(int i=0;i<12;i++){float angle=float(i)*0.5235987756;vec2 d=vec2(cos(angle),sin(angle))*uInputSize.zw;edge=max(edge,opacityAt(d*uRadius));soft+=opacityAt(d*uRadius*3.5)*0.055;soft+=opacityAt(d*uRadius*1.9)*0.028;}
float line=clamp((edge-original.a)*uStrength,0.0,1.0);float haze=clamp((soft-original.a)*uStrength*0.72,0.0,0.65);float glow=max(line,haze);vec3 color=mix(vec3(1.0,0.48,0.035),vec3(1.0,0.91,0.40),line);finalColor=original+vec4(color*glow,glow)*(1.0-original.a);}`;
export function createGoldenRim(renderer,stage,runtime={}){
 let {Filter,GlProgram}=runtime;
 if(!Filter||!GlProgram){
 const queue=[stage];let native;
 while(queue.length&&!native){const node=queue.shift();native=node?.filters?.find(f=>f.blurXFilter?.glProgram);if(node?.children)queue.push(...node.children)}
 if(!native)throw Error('현재 V3 장면의 네이티브 필터를 찾을 수 없습니다.');
 Filter=Object.getPrototypeOf(Object.getPrototypeOf(native)).constructor;GlProgram=native.blurXFilter.glProgram.constructor;
 }
 if(typeof Filter.from!=='function'||typeof GlProgram.from!=='function')throw Error('V3 필터 계약 불일치');
 const filter=new Filter({glProgram:GlProgram.from({name:'cardgu-live-golden-neon-rim',vertex,fragment,preferredFragmentPrecision:'highp'}),padding:22,resolution:'inherit',resources:{rimUniforms:{uStrength:{value:2.05,type:'f32'},uRadius:{value:2.5,type:'f32'}}}});
 Object.defineProperty(filter,'strength',{get(){return this.resources.rimUniforms.uniforms.uStrength},set(value){this.resources.rimUniforms.uniforms.uStrength=value}});
 filter.cardguRuntime='DEPLOYED_V3_NATIVE_FILTER_REGISTRY';return filter;
}
