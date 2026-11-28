const pct=(n,d)=>Math.max(0,Math.min(100,Math.round(n*100/Math.max(1,d))));
const rewardUnits=[[1_000_000_000_000,'조'],[100_000_000,'억'],[10_000,'만'],[1,'']];
export function formatRewardAmount(amount){
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('보상 수량은 0 이상의 안전한 정수여야 합니다.');
 let remaining=amount;
 const parts=[];
 for(const [unit,label] of rewardUnits){
  const groups=Math.floor(remaining/unit);
  if(groups)parts.push(groups.toLocaleString('ko-KR')+label);
  remaining%=unit;
 }
 return parts.join(' ')||'0';
}
export function rewardText({coin,masterStars}){
 return '코인 '+formatRewardAmount(coin)+' · 마별 '+formatRewardAmount(masterStars);
}
export const laneNames=['후미','화물칸','선두'];
export const stages={yard:['압축장 진입','아틀라스 교전','해체 판정','회수 정산'],escort:['협곡 진입','후미 방어','검문소 돌파','운송 정산']};
export function battlePlan(mode,fixture){
 const {payload,bossId,guardId,tier,receipt}=fixture, b=payload.battleV2,team=b.teams.A.cards,yard=mode==='yard',steps=[];
 const byId=new Map([...team,...(b.teams.A.mercenaries||[]),...(b.teams.A.supports||[]),...(payload.continuousEncounter?.instances||b.teams.B.cards)].map(a=>[a.id,a.memberName||a.title||a.name]));
 const speed=team.findIndex(a=>a.type==='SPEED'),guard=team.findIndex(a=>a.type==='DEFENSE');
 const slots=[0,0,1,2,2];if(speed>=0)[slots[2],slots[speed]]=[slots[speed],slots[2]];
 const s={stage:0,slots,arm:'none',target:guardId||bossId,targetHp:100,hull:100,cargo:100,hp:team.map(()=>100),frames:0,scrap:0,strikes:0,defeated:0,total:yard?2:1,reward:'',done:false};
 const add=(kind,props={})=>steps.push({kind,...props,state:structuredClone(s)});
 const timeline=b.result.timeline, keyHits=timeline.filter(e=>['TURN','ATTACK','COUNTER','PVE_ULTIMATE','SKILL_CHIP_HIT','ICON_SKILL'].includes(e.type));
 const sampled=new Set(keyHits.length<=25?keyHits:Array.from({length:15},(_,i)=>keyHits[Math.round((keyHits.length-1)*i/14)]));
 let boundCard=-1,moved=false;
 add('intro',{line:yard?'극성 회수기와 교전':'장갑 수송차 출발',hint:yard?'압축 설비를 돌파하고 아틀라스에서 부품을 회수합니다.':'호위대가 협곡을 지나 검문소까지 화물을 운송합니다.'});
 for(const e of timeline){
  const actor=team.findIndex(a=>a.id===e.actorId),target=team.findIndex(a=>a.id===e.targetId);
  if(target>=0&&Number.isFinite(e.targetHpAfter)&&e.targetMaxHp)s.hp[target]=pct(e.targetHpAfter,e.targetMaxHp);
  if(e.targetId===s.target&&Number.isFinite(e.targetHpAfter)&&e.targetMaxHp)s.targetHp=pct(e.targetHpAfter,e.targetMaxHp);
  if(e.type==='ENEMY_SPAWN'&&e.targetId===bossId){
   s.target=bossId;s.targetHp=100;s.arm='armed';s.stage=1;
   add('native',{event:e,line:'유압거신 아틀라스 출현',hint:'가동을 시작한 오른팔을 회수대가 조준합니다.'});
   add('armWarning',{line:'압축 피스톤 가동',hint:'두 카드의 연계 타격이나 강력한 단일 타격으로 프레임을 분리할 수 있습니다.'});continue;
  }
  if(e.type==='ESCORT_OBJECTIVE_ATTACK'){
   s.strikes++;if(s.strikes===1)add('roadWarning',{line:'선두에 낙하 잔해',hint:'습격 지휘관이 수송차를 겨눕니다.'});
   if(s.strikes>=3&&guard>=0&&s.hp[guard]>0)add('shield',{card:guard,line:byId.get(team[guard].id)+' · 장갑 방호',hint:'방어형 편성의 차량 피해 감소가 적용됩니다.'});
   s.hull=e.hullPercent;s.cargo=e.cargoPercent;s.stage=Math.max(s.stage,Math.min(2,s.strikes-1));
   add('native',{event:e,line:e.objectiveStrikeLabel||'차체 피격',hint:'차체 '+s.hull+'% · 화물 '+s.cargo+'%'});
   if(s.strikes===1&&s.hull>0)add('raidWarning',{line:'후미 습격 드론 접근',hint:'드론이 수송차의 화물칸을 노립니다.'});
   if(s.strikes===2&&s.hull>0)add('raid',{card:speed,damage:e.cargoDamage,line:moved?'후미 드론 저지':'화물칸 피격',hint:'화물 손실 '+e.cargoDamage+'%p · 보존율 '+s.cargo+'%'});
   continue;
  }
  if(e.type==='KO'){
   if(target>=0)s.hp[target]=0;
   if(e.targetId===bossId||e.targetId===guardId){s.defeated++;s.targetHp=0;}
   add('native',{event:e,line:(byId.get(e.targetId)||'전투원')+(target>=0?' 전투 불능':' 격파'),hint:yard&&guardId===e.targetId?'안쪽 압축 설비가 열렸습니다.':''});continue;
  }
  if(e.type==='RESULT'){
   if(!b.result.finalAtObjectiveLoss)for(const [i,a] of team.entries()){
    const final=b.result.final.A?.find(c=>c.id===a.id);if(final)s.hp[i]=pct(final.hp,final.maxHp||a.maxHp);
   }
   if(!b.result.finalAtObjectiveLoss)add('native',{event:e});
   s.won=receipt.won;s.stage=3;
   if(!yard&&s.won)add('arrival',{line:'검문소 도착',hint:'차량이 인계 지점에 진입합니다.'});
   s.done=true;s.reason=receipt.reason;
   s.coin=s.won?tier.coin:0;s.masterStars=s.won?tier.masterStars:0;
   s.reward=rewardText(s);
   if(yard){
    s.scrap=s.won?tier.scrap:0;s.frames=s.won?(s.arm==='recovered'?tier.frame:Math.ceil(tier.frame/2)):0;
    if(s.won)s.reward+=' · 고철 '+s.scrap+'개 · 유압 프레임 '+s.frames+'개';
   }else{
    s.grade=s.won?(s.cargo>=95?'S':s.cargo>=75?'A':'B'):'—';
    if(s.won)s.reward+=' · 화물 '+s.grade+'등급';
   }
   add('settle',{line:yard?(s.won?'폐차장 회수 완료':'폐차장 회수 실패'):(s.won?'검문소 인계 완료':'호송 실패'),hint:s.reward});continue;
  }
  const hit=Number(e.damage)>0||e.type==='ICON_SKILL'&&e.hits?.some(h=>h.damage>0);
  const cardHit=actor>=0&&hit&&!e.dodge;
  const willBind=yard&&cardHit&&e.targetId===bossId&&s.targetHp>0&&s.arm==='armed'&&s.targetHp<=90;
  const willExtract=yard&&cardHit&&e.targetId===bossId&&s.targetHp>0&&s.arm==='bound'&&actor!==boundCard&&s.targetHp<=65;
  const move=!yard&&!moved&&s.strikes===1&&actor>=0&&actor===speed&&cardHit;
 const burst=yard&&s.arm!=='recovered'&&e.targetId===bossId&&(String(e.actorId||'').startsWith('A:')||e.type==='PVE_ULTIMATE')&&e.targetMaxHp>0&&Number(e.damage)>=e.targetMaxHp*.65;
 const native=sampled.has(e)||willBind||willExtract||move||burst;
  if(native){
   const who=byId.get(e.actorId)||(e.type==='PVE_ULTIMATE'?'편성 궁극기':'전투 지원'),name=byId.get(e.targetId)||'교전 대상';
   const dmg=e.damage||e.hits?.reduce((n,h)=>n+(h.damage||0),0)||0;
   add('native',{event:e,card:actor,line:who+(e.type==='COUNTER'?' 반격':e.type==='PVE_ULTIMATE'?' 발동':' 공격'),hint:name+' · '+(e.dodge?'회피':dmg?'피해 '+Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1}).format(dmg):'보호막에 적중')});
  }
  if(willBind&&!burst){boundCard=actor;s.arm='bound';add('bind',{card:actor,line:(byId.get(team[actor].id)||'출전 카드')+' · 오른팔 고정',hint:'압축 피스톤이 멈췄습니다. 후속 공격이 관절을 노립니다.'});}
  if(willExtract||burst){s.arm='recovered';s.stage=2;const source=byId.get(e.actorId)||'편성 궁극기';add('extract',{card:actor,line:source+(burst?' · 장갑 관통':' · 프레임 분리'),hint:burst?'집중 타격으로 관절과 몸체가 분리됐습니다. 유압 프레임을 확보합니다.':'유압 프레임 확보 · 노출된 동력핵에 공격을 이어갑니다.'});}
  if(move){moved=true;const previous=[...s.slots];s.slots[actor]=0;s.stage=1;add('move',{card:actor,previous,line:(byId.get(team[actor].id)||'출전 카드')+' · 후미 지원',hint:'속도형 카드가 측면으로 이동해 화물 피해를 줄입니다.'});}
 }
 if(!steps.at(-1)?.state.done)throw Error('정산 기록이 없습니다.');
 return steps;
}
