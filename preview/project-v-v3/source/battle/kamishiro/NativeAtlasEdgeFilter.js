// Current V3's native registry avoids mixing shader IDs from a second Pixi module.
const vertex=`in vec2 aPosition;out vec2 vTextureCoord;uniform vec4 uInputSize;uniform vec4 uOutputFrame;uniform vec4 uOutputTexture;void main(){vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;p.x=p.x*(2.0/uOutputTexture.x)-1.0;p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;gl_Position=vec4(p,0.0,1.0);vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);}`;
const fragment=`in vec2 vTextureCoord;out vec4 finalColor;uniform sampler2D uTexture;uniform vec4 uInputClamp;uniform float uAlphaLift;uniform float uEdge;void main(){vec2 uv=(vTextureCoord-uInputClamp.xy)/max(uInputClamp.zw-uInputClamp.xy,vec2(.0001));float fade=smoothstep(0.,uEdge,uv.x)*smoothstep(0.,uEdge,1.-uv.x)*smoothstep(0.,uEdge,uv.y)*smoothstep(0.,uEdge,1.-uv.y);vec4 original=texture(uTexture,vTextureCoord);float alpha=min(1.,original.a*uAlphaLift);finalColor=vec4(original.rgb*(alpha/max(original.a,.00001)),alpha)*fade;}`;
export function createNativeAtlasEdgeFilter(stage,{opacityLift=1,edge=.09}={}){
 const queue=[stage];let native;while(queue.length&&!native){const node=queue.shift();native=node?.filters?.find(f=>f.blurXFilter?.glProgram);if(node?.children)queue.push(...node.children)}
 if(!native)throw Error('현재 V3 네이티브 필터 등록부를 찾을 수 없습니다.');
 const Filter=Object.getPrototypeOf(Object.getPrototypeOf(native)).constructor,GlProgram=native.blurXFilter.glProgram.constructor;
 return new Filter({glProgram:GlProgram.from({name:'doppelganger-native-atlas-density-v2',vertex,fragment}),padding:0,resolution:'inherit',resources:{edgeUniforms:{uAlphaLift:{value:opacityLift,type:'f32'},uEdge:{value:edge,type:'f32'}}}});
}
