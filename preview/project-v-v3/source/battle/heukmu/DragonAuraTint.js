const vertex=`in vec2 aPosition;out vec2 vTextureCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0.0,1.0);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);}`;
const fragment=`
in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;uniform float uGoldSource;
void main(){
 vec4 source=texture(uTexture,vTextureCoord);
 vec3 rgb=source.rgb/max(source.a,.00001);
 float light=dot(rgb,vec3(.2126,.7152,.0722));
 vec3 violet=mix(vec3(.018,.007,.045),vec3(.48,.045,.9),smoothstep(.10,.55,light));
 violet=mix(violet,vec3(.88,.52,1.0),smoothstep(.50,.95,light));
 vec3 blackDragon=min(vec3(1.0),pow(max(rgb,vec3(0.0)),vec3(.82))*1.18);
 finalColor=vec4(mix(blackDragon,violet,uGoldSource)*source.a,source.a);
}`;

export function createDragonAuraTint(stage,runtime={},goldSource=false){
 let {Filter,GlProgram}=runtime;
 if(!Filter||!GlProgram){
  const queue=[stage];let native;
  while(queue.length&&!native){const node=queue.shift();native=node?.filters?.find(f=>f.blurXFilter?.glProgram);if(node?.children)queue.push(...node.children);}
  if(!native)throw Error('흑룡 아우라용 V3 필터가 없습니다.');
  Filter=Object.getPrototypeOf(Object.getPrototypeOf(native)).constructor;
  GlProgram=native.blurXFilter.glProgram.constructor;
 }
 return new Filter({glProgram:GlProgram.from({name:'heukmu-dragon-aura-violet-v1',vertex,fragment,preferredFragmentPrecision:'highp'}),padding:0,resolution:'inherit',resources:{auraUniforms:{uGoldSource:{value:goldSource?1:0,type:'f32'}}}});
}
