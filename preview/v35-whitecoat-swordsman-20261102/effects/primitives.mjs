const t=(k,v)=>`<${k}>${v}</${k}>`;
const rnd=v=>t('Center',v)+t('Max',v)+t('Min',v);
const vec=(a,random=false)=>a.map((v,i)=>t('XYZ'[i],random?rnd(v):v)).join('');
const col=a=>a.map((v,i)=>t('RGBA'[i],v)).join('');
const ease=(a,b)=>t('Start',vec(a,true))+t('End',vec(b,true));
function ring({name,r=3,inner=r-.12,from=0,to=360,angleMotion=null,color=[255,185,75,255],life=22,delay=0,rotation=[0,0,0],spin=[0,0,0],start=[1,1,1],end=start,location=[0,0,0],velocity=[0,0,0],fade=life-2}){
 const angle=(prefix,a,b)=>t(prefix,2)+t(prefix+'_Easing',t('Start',rnd(a))+t('End',rnd(b)));
 const angles=angleMotion?angle('StartingAngle',from,angleMotion[0])+angle('EndingAngle',to,angleMotion[1]):t('StartingAngle_Fixed',from)+t('EndingAngle_Fixed',to);
 const crescent=to-from<359?t('RingShape',t('Type',1)+t('Crescent',t('StartingFade',Math.min(30,(to-from)/3))+t('EndingFade',Math.min(35,(to-from)/3))+angles)):'';
 return t('Node',t('Name',name)+t('CommonValues',t('Life',rnd(life))+t('GenerationTimeOffset',rnd(delay)))+
  t('LocationValues',t('Type',1)+t('PVA',t('Location',vec(location,true))+t('Velocity',vec(velocity,true))))+
  t('RotationValues',t('Type',1)+t('PVA',t('Rotation',vec(rotation,true))+t('Velocity',vec(spin,true))))+
  t('ScalingValues',t('Type',2)+t('Easing',ease(start,end)))+
  t('RendererCommonValues',t('AlphaBlend',2)+t('ZTest','False')+t('ZWrite','False')+t('FadeInType',1)+t('FadeIn',t('Frame',1))+t('FadeOutType',1)+t('FadeOut',t('Frame',fade)))+
  t('DrawingValues',t('Type',4)+t('Ring',crescent+t('VertexCount',96)+t('Outer_Fixed',t('Location',vec([r,0])))+t('Inner_Fixed',t('Location',vec([inner,0])))+t('CenterRatio_Fixed',.65)+t('OuterColor_Fixed',col([...color.slice(0,3),0]))+t('CenterColor_Fixed',col(color))+t('InnerColor_Fixed',col([...color.slice(0,3),0]))))+t('Children',''));
}
function spark(options,length,width){
 const positions=[['LL',[-length,0]],['LR',[0,-width]],['UL',[0,width]],['UR',[length,0]]].map(([k,v])=>t('Position_Fixed_'+k,vec(v))).join('');
 const drawing=t('DrawingValues',t('Type',2)+t('ColorAll',t('Type',0)+t('Fixed',col(options.color)))+t('Sprite',t('Billboard',2)+t('Position',1)+positions));
 return ring(options).replace(/<DrawingValues>.*?<\/DrawingValues>/,drawing);
}

export {t,ring,spark};
