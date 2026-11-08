// Presentation only: all values come from the existing actor clock or receipt.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(n,max=100)=>Math.max(0,Math.min(max,Number(n)||0));
const crops={
 'CN-02D9DC1E8A8A4209':[.52,.30,1.3], 'CN-0505936A0CBB4E59':[.54,.49,1.15],
 'CN-25F931CE393D474E':[.43,.25,2.1], 'CN-23EB4B19986D4818':[.49,.445,3.3],
 'CN-519C181C18DF4B8E':[.59,.22,2.8], 'V-968':[.502,.169,7.8], 'V-960':[.416,.116,6]
};
export const actorKey=(side,id)=>`${side}:${String(id)}`;
export function selectHudBoss(snapshot,payload){
 const enemies=snapshot.filter(a=>a.side==='B'&&a.active!==false);
 if(payload?.continuousEncounter)return enemies.find(a=>a.isBoss&&a.hp>0)||enemies.find(a=>a.isBoss)||enemies.find(a=>a.hp>0)||enemies[0];
 const id=String(payload?.battleV2?.teams?.B?.cards?.[0]?.id);
 return enemies.find(a=>String(a.id)===id)||enemies[0];
}
export function finalHudState(final={}) {
 const result=new Map();
 for(const side of ['A','B'])for(const c of [...(final[side]||[]),...(final.mercenaries?.[side]||[])]){
  if(c?.id==null)continue;
  result.set(actorKey(side,c.id),{id:String(c.id),side,hp:Number(c.maxHp)>0?clamp(Number(c.hp)/Number(c.maxHp)*100):clamp(c.hp),shield:clamp(Number(c.shield)/Number(c.maxShield),1),state:''});
 }
 return result;
}
export function rosterGroups(payload,mode){
 const teams=payload?.battleV2?.teams||{},rules=payload?.battleV2?.rules||{};
 const coop=rules.formation==='COOP_THREE_SQUADS',duo=rules.formation==='DUO_TWO_SQUADS';
 return ['A','B'].flatMap(side=>{
  if(side==='B'&&!['PVP','SIEGE'].includes(mode)&&!duo)return [];
  const team=teams[side]||{},members=coop||duo?team.members||[]:[null];
  return members.map((member,squad)=>({side,squad,member,
   cards:(team.cards||[]).filter(c=>c&&!c.isMonster&&!(String(c.cardId||c.id||'').startsWith('MONSTER:'))&&(!(coop||duo)||Number(c.squadIndex)===squad)),
   mercs:(team.mercenaries||[]).filter(c=>c&&(!(coop||duo)||Number(c.squadIndex)===squad))
  })).filter(g=>g.cards.length||g.mercs.length);
 });
}
export function createBattleHud({stage,payload,mode,runtime,artFor,isCurrent=()=>true}) {
 const roster=stage.querySelector('[data-v3-roster]');
 if(!roster)return {start(){},destroy(){},finalState(){}};
 stage.__v3Hud?.destroy();
 stage.append(roster); // The bottom dock now measures the verdict only.
 const groups=rosterGroups(payload,mode),versus=groups.some(g=>g.side==='B');
 stage.classList.add('has-tactical-hud');stage.classList.toggle('is-hud-pvp',versus);
 stage.classList.toggle('is-duo-battle',payload.battleV2?.rules?.formation==='DUO_TWO_SQUADS');
 roster.className='battle-v3-roster v3-hud-roster';roster.hidden=!groups.length;
 stage.classList.toggle('is-roster-visible',groups.length>0);
 const owners=[...stage.querySelectorAll('.battle-v3-versus span')].map(n=>n.textContent);
 const sources=new Map(),nodes=[],rails=[];
 const portrait=(c,side,merc)=>{
  const id=String(c.id??''),key=actorKey(side,id),name=String(merc?c.name||c.title:c.title||c.name||'카드');
  sources.set(key,c);
  const art=artFor(c),crop=crops[c.cardId||c.code],style=crop?`--face-x:${crop[0]*100}%;--face-y:${crop[1]*100}%;--portrait-zoom:${crop[2]}`:`object-position:${clamp(art.focusX)}% ${clamp(art.focusY)}%`;
  return `<li data-hud-actor="${esc(id)}" data-side="${side}" data-v3-roster-card="${esc(id)}" class="v3-hud-unit${merc?' is-mercenary':''}" aria-label="${esc(name)}"><div class="v3-hud-portrait"><img class="${crop?'is-cropped':''}" src="${esc(art.url)}" alt="" decoding="async" style="${style}"><i class="v3-hud-ko">전투불능</i></div><span class="v3-hud-name">${esc(name)}</span><div class="v3-hud-health" role="meter" aria-label="${esc(name)} 체력" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><em></em><i></i></div><div class="v3-hud-shield" aria-hidden="true"><i></i></div></li>`;
 };
 roster.innerHTML=['A','B'].map(side=>{
  const rows=groups.filter(g=>g.side===side);if(!rows.length)return '';
  return `<aside class="v3-hud-rail${side==='B'?' is-enemy':''}" data-hud-side="${side}" aria-label="${side==='A'?'아군':'상대'} 상태" style="--hud-squads:${rows.length}">${rows.map(g=>{
   const member=g.member,name=member?.ownerName||owners[side==='A'?0:1]||'';
   const rank=Number(member?.ownerRankLevel),rankAttr=Number.isInteger(rank)&&rank>=1&&rank<=250?` data-v3-roster-owner-rank-level="${rank}"`:'';
   return `<section class="battle-v3-roster-side" data-v3-roster-side="${side}" data-hud-squad="${g.squad}"><header><small data-v3-roster-label>${rows.length>1?'분대 '+(g.squad+1):side==='A'?'아군':'상대'}</small><span data-hud-count></span><b data-v3-roster-owner data-v3-roster-owner-id="${esc(member?.ownerId||'')}"${rankAttr}>${esc(name)}</b></header><ol data-v3-roster-list aria-label="출전 카드">${g.cards.map(c=>portrait(c,side,false)).join('')}</ol>${g.mercs.length?`<div class="v3-hud-group">용병 <span>${g.mercs.length}</span></div><ol aria-label="출전 용병">${g.mercs.map(c=>portrait(c,side,true)).join('')}</ol>`:''}</section>`;
  }).join('')}</aside>`;
 }).join('');
 for(const node of roster.querySelectorAll('[data-hud-actor]')){
  const key=actorKey(node.dataset.side,node.dataset.hudActor),source=sources.get(key);
  nodes.push({node,key,source,meter:node.querySelector('[role=meter]'),last:''});
  node.querySelector('img').addEventListener('error',function(){this.hidden=true;},{once:true});
 }
 for(const rail of roster.querySelectorAll('[data-hud-side]'))rails.push(rail);
 const squads=[...roster.querySelectorAll('[data-hud-squad]')].map(section=>({
  count:section.querySelector('[data-hud-count]'),entries:nodes.filter(entry=>section.contains(entry.node))
 }));
 function setText(node,text){if(node&&node.textContent!==text)node.textContent=text;}
 const bossMeter=stage.querySelector('[data-hud-boss-meter]'),bossFill=bossMeter?.querySelector('i');
 const enemyCount=stage.querySelector('[data-hud-enemies]'),bossPercent=stage.querySelector('[data-hud-boss-percent]');
 let destroyed=false,timer=null,frame=0,lastLayout='',frozen=null,started=false;
 function sync(){
  if(destroyed||!stage.isConnected||!isCurrent()||document.hidden)return;
  const snapshot=runtime.hudSnapshot?.()||[];
  const actors=new Map(snapshot.map(a=>[actorKey(a.side,a.id),a]));
  if(frozen)for(const [key,value]of frozen)actors.set(key,value);
  for(const entry of nodes){
   const actor=actors.get(entry.key);if(!actor)continue;
   const hp=clamp(actor.hp),shield=clamp(actor.shield,1),acting=hp>0&&/ATTACK|SKILL|CAST|WINDUP/.test(actor.state||'');
   const signature=[hp.toFixed(2),shield.toFixed(3),acting].join(':');if(entry.last===signature)continue;
   entry.last=signature;entry.node.style.setProperty('--hp',hp/100);entry.node.style.setProperty('--shield',shield);
   entry.node.classList.toggle('is-ko',hp<=0);entry.node.classList.toggle('is-low',hp>0&&hp<=25);entry.node.classList.toggle('is-acting',acting);
   entry.meter.setAttribute('aria-valuenow',String(Math.round(hp)));
   entry.node.setAttribute('aria-label',`${entry.source.name||entry.source.title||'카드'} · ${hp<=0?'전투불능':'체력 '+Math.round(hp)+'%'}${shield>0?' · 보호막 '+Math.round(shield*100)+'%':''}`);
  }
  for(const {count,entries} of squads)setText(count,entries.filter(n=>(actors.get(n.key)?.hp??100)>0).length+'/'+entries.length);
  const enemies=snapshot.filter(a=>a.side==='B'&&a.active!==false),selected=selectHudBoss(snapshot,payload);
  const boss=selected&&(actors.get(actorKey('B',selected.id))||selected),hp=clamp(boss?.hp??100);
  if(payload.continuousEncounter&&selected?.isBoss&&selected.name){const title=stage.querySelector('.battle-v3-versus span:last-child');if(title&&title.textContent!==selected.name)title.textContent=selected.name;}
  if(bossFill)bossFill.style.transform=`scaleX(${hp/100})`;
  const percent=String(Math.round(hp));
  if(bossMeter&&bossMeter.getAttribute('aria-valuenow')!==percent)bossMeter.setAttribute('aria-valuenow',percent);
  if(enemyCount)setText(enemyCount,'적 생존 '+enemies.filter(a=>(actors.get(actorKey('B',a.id))?.hp??a.hp)>0).length+' / '+enemies.length);
  if(bossPercent)setText(bossPercent,versus?'아군 '+nodes.filter(n=>n.node.dataset.side==='A'&&(actors.get(n.key)?.hp??100)>0).length+' / '+nodes.filter(n=>n.node.dataset.side==='A').length:percent+'%');
 }
 function measure(){
  frame=0;if(destroyed||!stage.isConnected)return;
  const box=stage.getBoundingClientRect(),short=box.height<=620&&box.width>box.height,compact=box.width<=760;
  const header=stage.querySelector('.battle-v3-header');let top=(header?.getBoundingClientRect().bottom||box.top)-box.top+12;
  const container=stage.closest('.coop-battle-portal')||stage;
  for(const el of container.querySelectorAll('.coop-battle-top,.coop-boss-hud,.wr3-boss-hud,.abyss-combat-hud,.jinmu-dialogue-rail')){
   const r=el.getBoundingClientRect();if(r.height&&getComputedStyle(el).display!=='none')top=Math.max(top,r.bottom-box.top+12);
  }
  top=Math.max(short?54:compact?112:100,top);
  stage.style.setProperty('--v3-hud-rail-top',`${top}px`);
  for(const rail of rails){
   const sections=rail.querySelectorAll('section'),columns=short||!compact?sections.length:1;
   rail.style.setProperty('--hud-columns',columns);
   const maxUnits=columns>1?Math.max(...[...sections].map(s=>s.querySelectorAll('[data-hud-actor]').length)):rail.querySelectorAll('[data-hud-actor]').length;
   const fixed=(columns>1?1:sections.length)*(sections.length>1?56:36);
   const dense=compact&&!short&&maxUnits>7;
   rail.classList.toggle('is-dense-vertical',dense);rail.classList.toggle('is-short-rail',short);
   const unitOverhead=short?10:dense?23:compact?35:49;
   const available=box.height-top-12-fixed;
   rail.style.setProperty('--hud-face-height',Math.max(8,Math.min(short?28:dense?22:compact?27:36,Math.floor(available/Math.max(1,maxUnits)-unitOverhead)))+'px');
  }
  const a=rails.find(r=>r.dataset.hudSide==='A')?.getBoundingClientRect(),b=rails.find(r=>r.dataset.hudSide==='B')?.getBoundingClientRect();
  let left=a?a.right-box.left+5:0,right=b?box.right-b.left+5:0;
  const party=stage.querySelector('.wr3-party');if(party&&box.width>=1200)right=Math.max(right,party.getBoundingClientRect().width);
  const signature=[Math.round(left),Math.round(right),Math.round(top),box.width,box.height].join(':');
  if(lastLayout!==signature){lastLayout=signature;stage.style.setProperty('--v3-hud-left',left+'px');stage.style.setProperty('--v3-hud-right',right+'px');stage.style.setProperty('--v3-hud-top',Math.max(50,top-12)+'px');if(started&&isCurrent())runtime.refreshHudLayout?.();}
 }
 function schedule(){if(!frame&&!destroyed)frame=requestAnimationFrame(measure);}
 const observer=new ResizeObserver(schedule);observer.observe(stage);
 const status=stage.querySelector('#pvBattleStatus');
 const noticeObserver=new MutationObserver(()=>status.classList.toggle('is-hud-notice',/지연|복구|실패|중단|다시 연결/.test(status.textContent)));
 if(status)noticeObserver.observe(status,{childList:true,characterData:true,subtree:true});
 const mutation=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'&&(r.target===stage||r.target===stage.parentElement)))schedule();});
 mutation.observe(stage,{childList:true});if(stage.parentElement)mutation.observe(stage.parentElement,{childList:true});
 window.addEventListener('resize',schedule);window.addEventListener('pagehide',destroy,{once:true});
 function destroy(){if(destroyed)return;destroyed=true;clearInterval(timer);cancelAnimationFrame(frame);observer.disconnect();mutation.disconnect();noticeObserver.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('pagehide',destroy);}
 const api={start(){if(destroyed)return;started=true;measure();runtime.refreshHudLayout?.();sync();if(!timer)timer=setInterval(sync,100);},sync,finalState(final){const next=finalHudState(final);if(next.size){frozen=next;sync();}},destroy};
 stage.__v3Hud=api;measure();return api;
}
