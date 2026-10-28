// Use the deployed Pixi registry so the outline shares the native renderer's shader IDs.
const vertex=`in vec2 aPosition;out vec2 vTextureCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0.0,1.0);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);}`;
const fragment=`
in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;uniform vec4 uInputSize;uniform vec4 uInputClamp;
float alphaAt(vec2 d){vec2 uv=vTextureCoord+d;if(any(lessThan(uv,uInputClamp.xy))||any(greaterThan(uv,uInputClamp.zw)))return 0.;vec4 c=texture(uTexture,uv);vec3 rgb=c.rgb/max(c.a,.00001);float redRibbon=smoothstep(.12,.36,rgb.r-max(rgb.g,rgb.b));return c.a*(1.-redRibbon);}
void main(){vec4 original=texture(uTexture,vTextureCoord);float edge=0.,soft=0.;
for(int i=0;i<12;i++){float a=float(i)*.5235987756;vec2 d=vec2(cos(a),sin(a))*uInputSize.zw;edge=max(edge,alphaAt(d*.85));soft+=alphaAt(d*4.2)*.026;soft+=alphaAt(d*2.2)*.025;}
float line=clamp((edge-original.a)*1.55,0.,.95);float halo=clamp((soft-original.a)*.8,0.,.28);float glow=max(line,halo);
vec3 crimson=mix(vec3(.72,.004,.035),vec3(1.,.14,.13),line);finalColor=original+vec4(crimson*glow,glow)*(1.-original.a);}`;
export function createCrimsonRim(stage){
 const queue=[stage];let native;while(queue.length&&!native){const n=queue.shift();native=n?.filters?.find(f=>f.blurXFilter?.glProgram);if(n?.children)queue.push(...n.children);}
 if(!native)throw Error('현재 V3 네이티브 네온 필터 등록부를 찾을 수 없습니다.');
 const Filter=Object.getPrototypeOf(Object.getPrototypeOf(native)).constructor,GlProgram=native.blurXFilter.glProgram.constructor;
 const filter=new Filter({glProgram:GlProgram.from({name:'doppelganger-crimson-silhouette-rim-v1',vertex,fragment,preferredFragmentPrecision:'highp'}),padding:7,resolution:'inherit'});
 filter.doppelgangerRuntime='DEPLOYED_V3_NATIVE_FILTER_REGISTRY';return filter;
}
