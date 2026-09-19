export const MANGISA_SKILL=Object.freeze({
 id:'MS-045',code:'V-045',name:'금란 연사',rank:'SS',role:'MARKSMAN',mechanic:'GOLDEN_ORCHID_VOLLEY',
 description:'화이트 골드 AK로 주 대상에게 빠르게 6연사합니다. 마지막 탄이 붉은 꽃잎과 금빛 파편으로 터져 주변 적 2명까지 타격합니다.',
 balance:Object.freeze({primaryRatio:3.2,secondaryRatio:.4,maxSecondaryTargets:2,totalRatioCap:4,cooldownTurns:5,cost:25,pvpScale:.82}),
 rule:'현재 행동 안에서 사격합니다. 별도 준비 턴·체력 조건·전탄 명중 조건이 없습니다. 회피·보호막·피해 경감은 정상 적용합니다. 주변 표적이 없을 때 남은 피해를 주 대상에게 몰아주지 않습니다.',
 counterplay:'시전자 사망·기절·침묵 시 남은 탄이 취소됩니다. 고정한 주 대상이 사라지면 남은 탄과 최종 확산은 소멸합니다. 타격마다 추가 행동·자원 회복·추가 스킬을 만들지 않습니다.',
 status:'BALANCE_DRAFT_USER_REVIEW_PENDING',runtimeEnabled:false,
 visual:Object.freeze({shots:[.42,.56,.70,.84,.98,1.23],travel:.075,impactAt:1.305,duration:2.85,color:'#f3c475'})
});
export function compileMangisaPreview({mode='PVP',targetCount=3,cancelAt=null,targetLostAt=null}={}){
 if(!['PVP','PVE'].includes(mode))throw Error('Unsupported battle mode');
 if(!Number.isInteger(targetCount)||targetCount<1||targetCount>3)throw Error('Target count must be 1..3');
 for(const value of [cancelAt,targetLostAt])if(value!==null&&(!Number.isFinite(value)||value<0))throw Error('Invalid interruption time');
 const s=MANGISA_SKILL,b=s.balance,scale=mode==='PVP'?b.pvpScale:1,stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity);
 const events=[{at:0,kind:'CAST',label:'조준 · 현재 행동에서 발사',cost:b.cost}];
 s.visual.shots.forEach((at,i)=>{
  if(at>=stop)return;
  const contact=Number((at+s.visual.travel).toFixed(3));
  if(contact>=stop)return;
  events.push({at,kind:'SHOT',shot:i,label:i===5?'마지막 개화탄 발사':`${i+1}번째 사격`});
  events.push({at:contact,kind:'HIT',shot:i,target:'E1',ratio:Number(((i===5?1:.44)*scale).toFixed(6)),label:i===5?'개화탄 직격':'연사 명중'});
  if(i===5)for(let j=1;j<targetCount;j++)events.push({at:contact,kind:'SPLASH',shot:i,target:`E${j+1}`,ratio:Number((b.secondaryRatio*scale).toFixed(6)),label:'주변 확산'});
 });
 if(Number.isFinite(stop))events.push({at:stop,kind:'CANCEL',label:targetLostAt!==null&&targetLostAt<=stop?'주 대상 소멸':'시전 중단'});
 events.sort((a,b)=>a.at-b.at);
 return {mode,targetCount,duration:s.visual.duration,events,scale,damageAuthority:'OFFLINE_PREVIEW_ONLY',budget:Math.round(events.filter(e=>e.kind==='HIT'||e.kind==='SPLASH').reduce((sum,e)=>sum+e.ratio,0)*1e6)/1e6};
}
export function sampleMangisaPreview(plan,time){
 const events=plan.events.filter(e=>e.at<=time),damage={E1:0,E2:0,E3:0};
 for(const e of events)if(e.kind==='HIT'||e.kind==='SPLASH')damage[e.target]+=e.ratio;
 return {events,damage,cancelled:events.some(e=>e.kind==='CANCEL'),label:events.at(-1)?.label||'재생 대기'};
}
export function mangisaPoseAt(time){
 if(time<.35||time>=1.72)return 0;
 if(time>=1.06&&time<1.23)return 3;
 if(time>=1.23&&time<1.36)return 4;
 if(time>=1.36)return 5;
 const previous=MANGISA_SKILL.visual.shots.slice(0,5).filter(t=>t<=time).at(-1);
 if(previous===undefined)return 0;
 return time-previous<.055?1:2;
}
