import { gsap } from 'gsap';
import { GROWTH_BRANCHES, DEFENSE_TRAITS, growthTier } from '../../../shared/monster-defense-growth-v2.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kindName={NORMAL:'일반 공세',ELITE:'정예 공세',BOSS:'보스 공세'};
const fmt=n=>Number(n).toLocaleString();
const moduleArt=(index,cls)=>'<span class="dw-module '+cls+'" aria-hidden="true" style="background-position:'+(index%4/3*100)+'% '+(Math.floor(index/4)*100)+'%"></span>';
export class DefenseWorkshop {
 constructor(send,notify=()=>{}) {
  this.send=send;this.notify=notify;this.branch='ATTACK';this.mode='forge';this.seen=new Set();this.busy=false;this.epoch=0;this.motion=matchMedia('(prefers-reduced-motion: reduce)');
  this.root=document.createElement('dialog');this.root.className='dw';this.root.setAttribute('aria-labelledby','dw-title');
  this.root.innerHTML='<div class="dw-shell"><header class="dw-header"><div class="dw-title"><span class="dw-kicker">디펜스 <span aria-hidden="true">/</span> <span data-wave></span></span><h2 id="dw-title">분대 정비</h2></div><div class="dw-wallet"><span>보유 포인트</span><strong data-wallet>0</strong><b>P</b></div><div class="dw-timer"><span>다음 공세</span><b><span data-time>15</span><small>초</small></b></div><button class="dw-close" data-action="close" aria-label="전장으로 돌아가기" type="button">×</button></header><div class="dw-time-track" aria-hidden="true"><i></i></div><nav class="dw-tabs" aria-label="정비 메뉴"><button data-tab="draw" type="button"><span>01</span><b>포인트 추첨</b></button><button data-tab="forge" type="button"><span>02</span><b>분대 강화</b></button><button data-tab="trait" type="button"><span>03</span><b>특성 선택</b><span data-trait-count></span></button></nav><div class="dw-content"></div><p class="dw-notice" role="status" aria-live="polite"></p><footer class="dw-footer"><div><div class="dw-party"></div><p data-footer-note>포인트와 강화는 이번 원정에서 유지됩니다.</p></div><button class="dw-secondary dw-ready" data-action="ready" type="button">정비 완료</button></footer></div>';
  document.body.append(this.root);this.$=s=>this.root.querySelector(s);
  this.root.addEventListener('cancel',e=>{e.preventDefault();this.close();});
  this.root.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action,tab=e.target.closest('[data-tab]')?.dataset.tab,branch=e.target.closest('[data-branch]')?.dataset.branch,trait=e.target.closest('[data-trait]')?.dataset.trait;
   if(action==='close'){this.close();return;}if(this.busy)return;
   if(tab){this.mode=tab;this.render();return;}if(branch){this.branch=branch;this.result=null;this.notice('');this.render();this.$('[data-branch="'+branch+'"]')?.focus();return;}
   if(action==='reveal')this.reveal();if(action==='forge')void this.forge();if(action==='ready')void this.ready();
   if(action==='continue'){this.mode=this.pendingOffer()?'trait':'forge';this.result=null;this.render();}
   if(trait)void this.chooseTrait(trait);
  });
  this.onVisible=()=>{if(!document.hidden&&Date.now()>=this.presentationDeadline)this.completePresentation?.();};
  document.addEventListener('visibilitychange',this.onVisible);
 }
 key(id){return 'defense-v3-viewed:'+id;}
 viewed(id){try{return this.seen.has(id)||sessionStorage.getItem(this.key(id))==='1';}catch{return this.seen.has(id);}}
 mark(id){this.seen.add(id);try{sessionStorage.setItem(this.key(id),'1');}catch{/* Optional cosmetic memory only. */}}
 pendingOffer(){return this.mine?.growth.offers.find(o=>!o.selected&&o.choices.some(id=>!this.mine.growth.traits.includes(id)));}
 notice(message){this.$('.dw-notice').textContent=message;}
 receive(snapshot,playerId){
  if(snapshot.version<3)return;
  this.snapshot=snapshot;this.mine=snapshot.players.find(p=>p.id===playerId);if(!this.mine?.growth)return;
  const currentDraw=this.mine.growth.draws.at(-1),attempt=this.mine.growth.attempts.at(-1);
  this.draw=currentDraw;
  // Server phases must never wait for a cosmetic animation or an HTTP response.
  if(snapshot.phase!=='PREP'){
   this.completePresentation?.();
   if(attempt&&!this.viewed(attempt.id)){this.mark(attempt.id);this.notify(this.forgeSummary(attempt));}
   if(this.root.open||this.busy)this.close();
   return;
  }
  if(snapshot.phase==='PREP'){
   if(currentDraw&&!this.viewed(currentDraw.id)&&this.autoDraw!==currentDraw.id&&!this.busy){
    this.autoDraw=currentDraw.id;this.notice('');this.mode='draw';this.result=null;this.open();
   }
   if(attempt&&!this.viewed(attempt.id)&&!this.animatingAttempt){this.animatingAttempt=attempt.id;this.open(false);this.showForgeResult(attempt);}
  }
  if(this.root.open)this.update();
 }
 open(render=true){if(!this.snapshot||this.snapshot.version<3||this.snapshot.phase!=='PREP')return;if(!this.root.open)this.root.showModal();if(render&&!this.completePresentation)this.render();this.update();}
 close(){
  this.epoch++;this.cancelPresentation();
  if(this.displayAttempt&&!this.viewed(this.displayAttempt.id)){this.mark(this.displayAttempt.id);this.notify(this.forgeSummary(this.displayAttempt));}
  this.busy=false;this.animatingAttempt=null;this.displayAttempt=null;this.result=null;if(this.draw)this.mark(this.draw.id);this.root.close();
 }
 dispose(){this.close();document.removeEventListener('visibilitychange',this.onVisible);this.root.remove();}
 cancelPresentation(){
  this.completePresentation=null;clearTimeout(this.presentationTimer);this.presentationTimer=null;this.presentationDeadline=Infinity;
  const timeline=this.timeline;this.timeline=null;timeline?.kill();
 }
 present(build,finish){
  this.cancelPresentation();const epoch=this.epoch;
  const complete=()=>{if(this.completePresentation!==complete||epoch!==this.epoch)return;this.cancelPresentation();finish();};
  this.completePresentation=complete;
  if(this.motion.matches){complete();return;}
  // GSAP can be paused/interrupted, or throttled while the tab is hidden.
  // Only reveal the existing receipt; this fallback never submits a command.
  this.presentationDeadline=Date.now()+3000;this.presentationTimer=setTimeout(complete,3000);
  try{this.timeline=gsap.timeline({onComplete:complete,onInterrupt:complete});build(this.timeline);}catch{complete();}
 }
 forgeSummary(r){return (r.success?'강화 성공':'강화 실패')+' · '+GROWTH_BRANCHES.find(b=>b.id===r.branch).name+' +'+r.after+' · '+r.cost+'P 소모';}
 update(){
  const s=this.snapshot,p=this.mine,prep=s.phase==='PREP',seconds=prep?Math.max(0,Math.ceil((s.phaseUntil-s.time)/1000)):0;
  this.$('[data-wave]').textContent=String(s.wave).padStart(2,'0')+' / '+s.totalWaves+' 공세';
  this.$('[data-time]').textContent=seconds;this.$('.dw-timer').classList.toggle('dw-urgent',seconds<=5);
  const duration=Math.max(1,(s.phaseUntil-(s.prepStartedAt??s.phaseUntil-s.growthPolicy.prepSeconds*1000))/1000);
  this.$('.dw-time-track i').style.width=(prep?Math.min(100,100*seconds/duration):0)+'%';
  this.$('[data-wallet]').textContent=fmt(this.mode==='draw'&&this.draw&&!this.viewed(this.draw.id)?Math.max(0,p.credits-this.draw.amount):p.credits);
  const offers=p.growth.offers.filter(o=>!o.selected&&o.choices.length).length;
  this.$('[data-trait-count]').textContent=offers||'';
  this.$('.dw-party').innerHTML=s.players.map(m=>'<span class="'+(m.growth.readyWave===s.wave?'dw-is-ready':'')+'"><i></i>'+esc(m.name)+(m.id===p.id?' · 나':'')+'<small>'+(m.growth.readyWave===s.wave?'준비 완료':'정비 중')+'</small></span>').join('');
  const ready=this.$('[data-action="ready"]');ready.disabled=!prep||this.busy;ready.textContent=p.growth.readyWave===s.wave?'준비 취소':'정비 완료';ready.setAttribute('aria-pressed',String(p.growth.readyWave===s.wave));
  this.$('[data-footer-note]').textContent=prep&&s.waveBrief
   ? `${s.waveBrief.wave}W · ${s.waveBrief.kind==='NORMAL'?'전 전선':String.fromCharCode(65+s.waveBrief.focus)+' 전선'} ${s.waveBrief.name} — ${s.waveBrief.hint} 포인트·미선택 특성 이월`
   :prep?'시간 종료 시 자동 출발 · 포인트와 미선택 특성은 다음 정비로 이월':'공세 진행 중 · 다음 정비에서 계속';
  this.root.querySelectorAll('[data-tab]').forEach(el=>{el.disabled=this.busy;el.setAttribute('aria-current',String(el.dataset.tab===this.mode));});
  const forge=this.$('[data-action="forge"]');if(forge){const level=p.growth.levels[this.branch],tier=growthTier(s.growthPolicy,level+1);forge.disabled=this.busy||!prep||!tier||p.credits<tier.cost;forge.textContent=this.busy?'결과 확인 중…':!tier?'최대 강화 완료':p.credits<tier.cost?fmt(tier.cost-p.credits)+'P 부족':fmt(tier.cost)+'P · 강화 시도';}
  this.root.querySelectorAll('[data-trait]').forEach(el=>el.disabled=this.busy||!prep);
 }
 device(kind){return '<div class="dw-device-stage"><div class="dw-device dw-'+kind+'" role="img" aria-label="'+(kind==='capsule'?'기계식 보급 캡슐':'분대 강화 반응로')+'"></div><span class="dw-device-caption">'+(kind==='capsule'?'개인 보급 캡슐':'분대 강화 반응로')+'</span></div>';}
 frame(n){const el=this.$('.dw-device');if(el){const i=Math.max(0,Math.min(7,Math.floor(n)));el.style.backgroundPosition=(i%4/3*100)+'% '+(Math.floor(i/4)*100)+'%';el.dataset.frame=i;}}
 render(){
  if(!this.mine)return;
  if(this.completePresentation){this.completePresentation();return;}
  const content=this.$('.dw-content');content.className='dw-content dw-mode-'+this.mode;
  if(this.mode==='draw')this.renderDraw(content);
  if(this.mode==='forge')this.renderForge(content);
  if(this.mode==='trait')this.renderTraits(content);
  this.update();
 }
 renderDraw(content){
  const d=this.draw,seen=d&&this.viewed(d.id);
  content.innerHTML='<div class="dw-visual">'+this.device('capsule')+'</div><section class="dw-details"><span class="dw-kicker">'+(d?d.wave+'공세 통과 · '+kindName[d.kind]:'첫 공세 준비')+'</span><h3>'+(d?'이번 보급을 확인하세요':'분대를 강화하세요')+'</h3><p class="dw-lead">'+(d?'공세를 통과한 대원마다 포인트를 추첨합니다.':'공세 통과 후 확률로 포인트를 얻고,<br>공격·생존·전술을 골라 강화하세요.')+'</p>'+(d?'<div class="dw-odds"><div><span>획득 확률</span><strong>'+d.chance+'<small>%</small></strong></div><div><span>당첨 포인트</span><strong>'+fmt(d.prize)+'<small>P</small></strong></div></div>':'<div class="dw-explainer"><p>일반·정예·보스별 포인트 추첨</p><p>확률 강화 · 실패해도 단계 유지</p><p>5공세마다 무료 특성 선택</p></div>')+'<div class="dw-reveal-result" aria-live="polite"></div><div class="dw-draw-actions">'+(d&&!seen?'<button type="button" data-action="reveal" class="dw-primary">포인트 확인</button>':'<button type="button" data-action="continue" class="dw-primary">'+(this.pendingOffer()?'특성 선택하기':'분대 강화하기')+'</button>')+'</div><p class="dw-fineprint">'+(d?'미당첨 시 0P · 결과는 다시 열어도 바뀌지 않습니다.':'포인트와 강화는 이번 원정에서만 사용합니다.')+'</p></section>';
  if(seen){this.frame(7);this.drawResult(d);}
 }
 drawResult(d){
  this.$('.dw-device')?.classList.toggle('dw-empty',!d.won);
  this.$('.dw-reveal-result').innerHTML='<span class="dw-kicker">'+(d.won?'보급 획득':'추첨 결과')+'</span><strong class="'+(d.won?'dw-won':'dw-miss')+'">'+(d.won?'+'+fmt(d.amount)+'<small>P</small>':'이번 추첨은 미당첨')+'</strong><p>'+(d.won?'강화에 사용하거나 다음 공세까지 모아두세요.':'획득 포인트 0P · 다음 공세에서 다시 도전하세요.')+'</p>';
 }
 reveal(){
  if(this.busy||!this.draw||this.viewed(this.draw.id))return;
  const d=this.draw;this.busy=true;this.update();this.$('.dw-draw-actions').innerHTML='<p class="dw-opening" role="status">포인트 확인 중…</p>';
  const finish=()=>{this.mark(d.id);this.busy=false;this.frame(7);this.drawResult(d);this.$('.dw-draw-actions').innerHTML='<button type="button" data-action="continue" class="dw-primary">'+(this.pendingOffer()?'특성 선택하기':'분대 강화하기')+'</button>';this.update();this.$('[data-action="continue"]').focus({preventScroll:true});this.$('.dw-reveal-result').scrollIntoView({block:'nearest'});if(this.snapshot.phase!=='PREP'){this.notify(d.won?'포인트 추첨 +'+d.amount+'P 획득':'포인트 추첨 미당첨 · 획득 0P');this.close();}};
  const frame={value:0};this.present(t=>t.to(frame,{value:7,duration:1.35,ease:'none',onUpdate:()=>this.frame(frame.value)}).fromTo(this.$('.dw-device'),{y:5},{y:0,duration:.35,ease:'power2.out'}),finish);
 }
 renderForge(content){
  const p=this.mine,policy=this.snapshot.growthPolicy,b=GROWTH_BRANCHES.find(x=>x.id===this.branch),level=this.displayAttempt?.before??p.growth.levels[b.id],tier=growthTier(policy,level+1),effect=policy.effects[b.key],prefix=b.id==='TACTIC'?'−':'+';
  content.innerHTML=`<div class="dw-forge-left"><span class="dw-kicker">내 분대 · 용병 2 + 카드 1</span><h3>강화할 능력 선택</h3><div class="dw-branches">${GROWTH_BRANCHES.map(branch=>{
   const lv=p.growth.levels[branch.id],t=growthTier(policy,lv+1);
   return '<button type="button" class="dw-branch" data-branch="'+branch.id+'" aria-pressed="'+(b.id===branch.id)+'">'+moduleArt({ATTACK:0,VITAL:1,TACTIC:4}[branch.id],'dw-branch-symbol')+'<span><b>'+branch.name+' <em>+'+lv+'</em></b><span>'+branch.description+'</span></span><strong><small>성공률</small>'+(t?t.chance+'<small>%</small>':'MAX')+'</strong></button>';
  }).join('')}</div><p class="dw-fineprint">선택한 능력이 내 분대 전체에 적용됩니다.</p><div class="dw-levels" aria-label="현재 ${level}강, 최대 10강">${Array.from({length:10},(_,i)=>'<i class="'+(i<level?'is-lit':'')+'">'+(i+1)+'</i>').join('')}</div></div>
  <div class="dw-forge-center">${this.device('reactor')}<div class="dw-forge-result" role="status" aria-live="polite"></div></div>
  <section class="dw-details dw-forge-details"><span class="dw-kicker">${tier?'다음 강화':'최대 단계 도달'}</span><h3>${b.name} <em>+${level}</em><span class="dw-arrow"> → </span><em>+${Math.min(10,level+1)}</em></h3><div class="dw-effect"><span>${b.description}</span><strong>${prefix+(level*effect)}% <span>→</span> ${prefix+(Math.min(10,level+1)*effect)}%</strong></div><div class="dw-odds"><div><span>성공 확률</span><strong>${tier?tier.chance:'—'}<small>%</small></strong></div><div><span>시도 비용</span><strong>${tier?fmt(tier.cost):'—'}<small>P</small></strong></div></div><button type="button" class="dw-primary" data-action="forge">강화 시도</button><p class="dw-failure-policy">실패 시 <b>+${level} 유지</b> · 시도마다 ${tier?fmt(tier.cost):0}P 소모<br>실패 보정 · 확정 강화 없음</p><div class="dw-tier-table" aria-label="단계별 성공 확률">${policy.tiers.map((t,i)=>'<span><small>'+['+1–3','+4–6','+7–9','+10'][i]+'</small><b>'+t.chance+'%</b></span>').join('')}</div></section>`;
  if(this.result){const r=this.result;this.frame(r.success?7:0);this.forgeResultText(r);}
 }
 async forge(){
  if(this.busy||this.snapshot.phase!=='PREP')return;
  this.busy=true;this.notice('');this.result=null;this.update();const epoch=this.epoch,seq=this.mine.growth.attemptSeq;
  let ok=false;try{ok=await this.send({type:'FORGE',wave:this.snapshot.wave,branch:this.branch,expectedAttempt:seq});}catch{/* Polling will recover any persisted receipt. */}
  if(epoch!==this.epoch)return;
  if(!this.animatingAttempt){this.busy=false;if(!ok&&!this.result)this.notice('강화 결과를 확인하지 못했습니다. 연결이 복구되면 저장된 결과를 다시 확인합니다.');this.update();}
  // Successful commands are revealed only from a persisted server receipt in receive().
 }
 forgeResultText(r){const b=GROWTH_BRANCHES.find(x=>x.id===r.branch);
  const el=this.$('.dw-forge-result');if(el)el.innerHTML='<span class="dw-kicker">강화 결과</span><strong class="'+(r.success?'dw-won':'dw-miss')+'">'+(r.success?b.name+' +'+r.after+' 성공':b.name+' 강화 실패')+'</strong><span>'+ (r.success?'분대 능력이 상승했습니다.':'기존 +'+r.before+' 단계를 유지합니다.')+'<br>−'+fmt(r.cost)+'P · 잔여 '+fmt(r.balance)+'P</span>';
 }
 showForgeResult(r){
  this.completePresentation?.();
  this.mode='forge';this.branch=r.branch;this.busy=true;this.result=null;this.displayAttempt=r;this.render();this.busy=true;this.update();
  this.$('.dw-forge-result').innerHTML='<span class="dw-kicker">강화 진행 중</span><strong>반응로 가동 중</strong>';
  this.$('.dw-forge-center').scrollIntoView({block:'nearest'});
  const finish=()=>{this.mark(r.id);this.busy=false;this.animatingAttempt=null;this.displayAttempt=null;this.result=r;this.render();this.$('.dw-forge-result').scrollIntoView({block:'nearest'});this.notice((r.success?'강화 성공. ':'강화 실패. ')+GROWTH_BRANCHES.find(b=>b.id===r.branch).name+' +'+r.after+' · '+r.cost+'P 소모');if(this.snapshot.phase!=='PREP'){this.notify((r.success?'강화 성공':'강화 실패')+' · '+GROWTH_BRANCHES.find(b=>b.id===r.branch).name+' +'+r.after+' · '+r.cost+'P 소모');this.close();}};
  const frame={value:0};this.present(t=>t.to(frame,{value:5,duration:1.2,ease:'none',onUpdate:()=>this.frame(frame.value)}).to(frame,{value:r.success?7:0,duration:.55,ease:'none',onUpdate:()=>this.frame(frame.value)}).to({}, {duration:.35}),finish);
 }
 renderTraits(content){
  const offer=this.pendingOffer();
  content.innerHTML='<section class="dw-trait-heading"><span class="dw-kicker">'+(offer?offer.wave+'공세 통과':'5공세마다 특성 제안')+' · 포인트 소모 없음</span><h3>분대 특성을 선택하세요</h3><p>'+(offer?'세 가지 중 하나를 선택하면 이번 원정 동안 적용됩니다.':'5공세를 통과할 때마다 무작위 특성 중 하나를 선택합니다.')+'</p></section><div class="dw-trait-grid">'+(offer?offer.choices.map((id,index)=>{const t=DEFENSE_TRAITS.find(t=>t.id===id);return '<button type="button" class="dw-trait" data-trait="'+id+'"><span class="dw-trait-number" aria-hidden="true">0'+(index+1)+'</span><span class="dw-kicker">'+t.tag+'</span>'+moduleArt(DEFENSE_TRAITS.indexOf(t),'dw-trait-symbol')+'<h4>'+t.name+'</h4><p>'+t.description+'</p><span class="dw-trait-choose">이 특성 선택 <b aria-hidden="true">↗</b></span></button>';}).join(''):'<div class="dw-trait-empty">다음 특성 제안을 기다리고 있습니다.<br><small>전투 중에는 선택이 잠깁니다.</small></div>')+'</div><div class="dw-owned"><span>보유 특성</span>'+(this.mine.growth.traits.map(id=>'<b>'+DEFENSE_TRAITS.find(t=>t.id===id).name+'</b>').join('')||'<small>아직 획득한 특성이 없습니다.</small>')+'</div>';
 }
 async chooseTrait(traitId){const offer=this.pendingOffer();if(!offer)return;this.busy=true;this.update();const epoch=this.epoch;
  const ok=await this.send({type:'TRAIT',wave:this.snapshot.wave,offerId:offer.id,traitId});
  if(epoch!==this.epoch)return;this.busy=false;
  if(ok){this.notice(DEFENSE_TRAITS.find(t=>t.id===traitId).name+' 적용 완료');this.mode='forge';}this.render();
 }
 async ready(){this.busy=true;this.update();const epoch=this.epoch;await this.send({type:'READY_WAVE',wave:this.snapshot.wave,ready:this.mine.growth.readyWave!==this.snapshot.wave});if(epoch!==this.epoch)return;this.busy=false;this.update();}
}
