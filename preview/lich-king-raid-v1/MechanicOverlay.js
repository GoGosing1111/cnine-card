import {projectLichChallenge,lichControlKey} from './clock.mjs';
import {renderCoop,tickCoop} from './CoopOverlay.js';

const RUNES=['달','가시','왕관'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={달:'<path d="M23 4a13 13 0 1 0 5 23A14 14 0 0 1 23 4Z"/>',가시:'<path d="m16 3 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z"/><path d="m7 7 18 18M25 7 7 25"/>',왕관:'<path d="m4 10 6 6 6-12 6 12 6-6-3 16H7Z"/><path d="M8 22h16"/>'};
const rune=name=>`<svg viewBox="0 0 32 32" aria-hidden="true">${icons[name]||icons.왕관}</svg>`;
const seconds=ms=>Math.max(0,Math.ceil(ms/1000));
const time=ms=>{const s=seconds(ms);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};

// A mechanic layer inside the canonical V3 canvas host. It owns neither the
// renderer nor the formation/dock. Pixi world coordinates keep the host mark
// attached to the existing actor; the engine's GSAP timeline owns feedback.
export class MechanicOverlay{
  constructor(engine,host){
    const {Container,Graphics}=window.ProjectVPixiBattle.fxRuntime;
    this.engine=engine;this.host=host;this.state=null;this.key='';this.offset=0;this.lastPaint=0;this.feedbackSeq=0;this.flashSerial=0;this.pending=false;
    this.element=document.createElement('section');
    this.element.className='lich-mechanic-screen';
    this.element.setAttribute('aria-label','리치왕 전장 기믹');
    this.element.innerHTML=`<div class="lk-vignette" aria-hidden="true"></div>
      <div class="lk-boss-hud"><div><span data-phase></span><b data-health></b></div><div class="lk-hp-track"><i data-hp></i><em data-floor></em></div><div class="lk-phase-pips" aria-hidden="true">Ⅰ ━ Ⅱ ━ Ⅲ ━ Ⅳ</div></div>
      <div class="lk-enrage"><small>광폭화</small><b data-enrage>03:30</b></div>
      <div class="lk-order"><small data-order-caption></small><h2 data-order-title></h2><p data-order-help></p><span class="lk-role-hint" data-role-hint></span></div>
      <div class="lk-cast" data-cast hidden></div>
      <div class="lk-host-mark" data-host-mark hidden></div>
      <div class="lk-objectives" data-objectives></div>
      <div class="lk-console"><div data-targets></div><div data-seals></div><div class="lk-supplies" data-support></div><div class="lk-party-status"><span data-doom></span><span data-souls></span><span data-window></span></div></div>
      <div class="lk-input-status" data-input-status role="status" hidden>입력 처리 중…</div>
      <div class="lk-feedback" data-feedback role="status" hidden></div>`;
    host.appendChild(this.element);
    this.world=new Container({label:'LichMechanicTelegraph',eventMode:'none'});
    this.halo=new Graphics();this.world.addChild(this.halo);engine.effectLayer.addChild(this.world);
    const input=b=>({action:b.dataset.action,target:b.dataset.target||'',challengeId:this.state.challenge.id,...(b.dataset.stepToken?{stepToken:b.dataset.stepToken}:{})});
    this.onPointerDown=e=>{const b=e.target.closest('[data-action]');this.pressedInput=b&&!b.disabled&&this.state?{button:b,detail:input(b)}:null;};
    this.clearPointer=()=>{this.pressedInput=null;};
    this.onClick=e=>{const b=e.target.closest('[data-action]'),pressed=this.pressedInput;this.pressedInput=null;if(!b||b.disabled||this.pending||!this.state)return;
      // Shared heal/phase updates during a held press must not turn the original
      // intent into a second charge or a new step when the pointer is released.
      window.dispatchEvent(new CustomEvent('lich-raid-action',{detail:e.detail&&pressed?.button===b?pressed.detail:input(b)}));};
    this.element.addEventListener('pointerdown',this.onPointerDown);
    this.element.addEventListener('pointercancel',this.clearPointer);
    this.element.addEventListener('keydown',this.clearPointer);
    this.element.addEventListener('click',this.onClick);
    this.onTick=()=>this.tick();engine.app.ticker.add(this.onTick);
    this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(host);
    const dock=host.parentElement.querySelector('[data-v3-dock]');if(dock)this.observer.observe(dock);
    this.layout();
  }
  node(name){return this.element.querySelector(`[data-${name}]`);}
  allowed(role){return this.state.status==='ACTIVE'&&(this.state.mode==='COMMAND'||this.state.me.role===role);}
  button(action,label,{target='',role='RESCUE',disabled=false,kind='',icon='',count=null,ariaLabel=label}={}){
    if(this.state.mode!=='COMMAND'&&this.state.me.role!==role)return '';
    return `<button type="button" class="lk-action ${kind}" data-action="${action}" data-target="${esc(target)}" aria-label="${esc(ariaLabel)}" ${disabled||!this.allowed(role)?'disabled':''}>${icon}<span>${esc(label)}</span>${count!==null?`<b>${count}</b>`:''}</button>`;
  }
  runeTargets(action,label,description,{disabled=false,kind=''}={}){
    if(this.state.mode!=='COMMAND'&&this.state.me.role!=='RESCUE')return '';
    return `<div class="lk-rune-set ${kind}"><div class="lk-set-title"><b>${label}</b><span>${description}</span></div><div class="lk-rune-targets">${RUNES.map((name,i)=>this.button(action,name,{target:name,ariaLabel:label+' · '+name+(action==='TRANSFER'?' 구울':' 영혼'),disabled,icon:rune(name),kind:'lk-rune-target rune-'+i})).join('')}</div></div>`;
  }
  update(state,events=[]){
    this.state=state;this.offset=(state.responseNow||state.serverNow)-Date.now();
    const c=state.challenge;if(!c)return;
    const critical=state.step==='MECHANIC'&&!c.interrupted&&c.cast==='SOUL_ANNIHILATION';
    this.element.dataset.step=state.step;this.element.dataset.kind=c.kind||state.step;
    this.element.dataset.urgent=String(critical||c.plague&&c.plagueStacks>=4);
    this.element.dataset.prison=String(Boolean(c.prison));
    this.element.dataset.active=String(state.status==='ACTIVE');
    this.node('phase').textContent=`PHASE ${state.phase} · ${state.phaseName}`;
    this.node('health').textContent=(state.bossHp/state.bossMaxHp*100).toFixed(1)+'%';
    this.node('hp').style.width=state.bossHp/state.bossMaxHp*100+'%';
    this.node('floor').style.left=state.roundFloor/state.bossMaxHp*100+'%';
    const cue=events.findLast(e=>['RAID_LICH_TRANSFER','RAID_LICH_BREATH','RAID_LICH_INTERRUPT','RAID_LICH_MISTAKE','RAID_LICH_SEAL','RAID_LICH_EXPOSED'].includes(e.type));
    if(cue&&cue.seq>this.feedbackSeq){this.feedbackSeq=cue.seq;this.flash(cue.label,cue.type==='RAID_LICH_MISTAKE');}
    this.tick(true);
  }
  render(c=this.state.challenge){
    if(this.state.rulesVersion===2){renderCoop(this,c);return;}
    const s=this.state,r=s.resources,active=s.status==='ACTIVE',mechanic=active&&s.step==='MECHANIC',exposed=active&&s.step==='EXPOSED';
    const names={PLAGUE:'죽음의 역병',PRISON:'절대영도',CONVERGENCE:'세 갈래의 죽음',FINALE:'왕관의 봉인'};
    const title=!active?(s.status==='CLEAR'?'왕좌가 무너졌다':'공대 전멸'):s.step==='READY'?'왕좌 앞에 집결하라':s.step==='TRANSITION'?'다음 방벽으로':exposed?'왕의 방벽 붕괴':names[c.kind];
    const help=!active?'':s.step==='READY'?'역병은 전이하고, 영혼 말살은 차단하라.':s.step==='TRANSITION'?'다음 기믹에 대비하라. 공대 체력과 자원은 유지된다.':exposed?'지금 공격하라 · 다음 HP 방벽까지 돌파':c.kind==='FINALE'?'해방된 영혼 3개로 왕관의 봉인을 풀어라':c.prison?'감옥을 지켜라 · 절대영도 후 역병 전이':c.kind==='CONVERGENCE'?'역병 전이 · 영혼 구출 · 순서 봉인':c.plague?`${c.plagueRune} 문양의 구울에게 2~4중첩 역병을 전이하라`:'영혼 말살이 시전되면 즉시 차단하라';
    this.node('order-caption').textContent=exposed?'DAMAGE WINDOW':`ENCOUNTER ${s.round} / 7`;
    this.node('order-title').textContent=title;this.node('order-help').textContent=help;
    const duties={ASSAULT:exposed?'집중 공격으로 방벽 돌파':'엄폐를 유지하고 공격 기회에 대비',WARDEN:exposed?'다음 말살 차단에 대비':c.cast==='SOUL_ANNIHILATION'&&!c.interrupted?'지금 영혼 말살 차단':c.sequence&&!c.sealed&&['CONVERGENCE','FINALE'].includes(c.kind)?'표시된 순서로 봉인 해제':'영혼 말살 시전까지 차단 대기',RESCUE:exposed?'공대 체력 확인 · 필요 시 회복':c.plague?c.prison?'절대영도 흡수 후 역병 전이':c.plagueStacks<2?'2중첩까지 대기 후 같은 문양에 전이':'같은 문양의 구울에 역병 전이':['CONVERGENCE','FINALE'].includes(c.kind)?'같은 문양의 영혼 구출':'공대 체력 확인'};
    const roleNames={ASSAULT:'정벌대',WARDEN:'봉인대',RESCUE:'구출대'};
    this.node('role-hint').textContent=active&&['MECHANIC','EXPOSED'].includes(s.step)?(roleNames[s.me.role]?roleNames[s.me.role]+' · ':'')+(duties[s.me.role]||help):'';
    const cast=this.node('cast');cast.hidden=!mechanic||c.kind==='FINALE';
    if(!cast.hidden){
      const critical=c.cast==='SOUL_ANNIHILATION'&&!c.interrupted;
      cast.dataset.critical=String(critical);cast.dataset.resolved=String(c.interrupted);
      cast.innerHTML=`<div class="lk-cast-label"><span>${c.interrupted?'시전 중단':critical?'영혼 말살':'서리 폭발'}</span><b data-cast-time></b></div><div class="lk-cast-track"><i data-cast-fill></i></div>${this.button('INTERRUPT',c.interrupted?'차단 성공':critical?'지금 차단':'차단 대기',{role:'WARDEN',disabled:!critical||c.interrupted||!r.interrupt,kind:critical?'lk-interrupt critical':'lk-interrupt',count:r.interrupt})}<small>${c.interrupted?'말살 저지 완료':critical?'실패 시 공대 전멸':'영혼 말살을 기다려라'}</small>`;
    }
    const mark=this.node('host-mark');mark.hidden=!mechanic||!c.plague;
    if(!mark.hidden){mark.setAttribute('aria-label',`${c.targetName} · 죽음의 역병 ${c.plagueStacks}중첩`);mark.innerHTML=`<span class="lk-host-rune">${rune(c.plagueRune)}</span><span>${c.prison?'서리 감옥 · 엄폐 유지':`죽음의 역병 · ${c.plagueStacks}중첩`}</span><div class="lk-stack-pips">${Array.from({length:5},(_,i)=>`<i class="${i<c.plagueStacks?'filled':''}"></i>`).join('')}</div>`;}
    this.world.visible=!mark.hidden&&Boolean(this.engine.combatantById(c.targetId));
    if(!this.world.visible&&!mark.hidden){mark.classList.add('is-remote');mark.innerHTML='<strong>'+esc(c.targetName)+'</strong>'+mark.innerHTML;}else mark.classList.remove('is-remote');
    this.halo.clear();
    if(this.world.visible){const color=c.prison?0x9be7ff:c.plagueStacks>=4?0xff876b:0xa9efb3;
      this.halo.ellipse(0,0,83,27).fill({color,alpha:.1}).stroke({color,alpha:.85,width:3});
      this.halo.ellipse(0,0,101,34).stroke({color,alpha:.35,width:2});
      this.halo.moveTo(-112,0).lineTo(-94,0).moveTo(94,0).lineTo(112,0).stroke({color,width:3});
    }
    let targets='';
    if(mechanic&&c.plague)targets+=this.runeTargets('TRANSFER','역병 전이',c.prison?'감옥 해제 후 전이':c.plagueStacks<2?'2중첩까지 대기':`숙주 문양 · ${esc(c.plagueRune)}`,{disabled:c.prison||c.plagueStacks<2,kind:'lk-plague-targets'});
    if(mechanic&&['CONVERGENCE','FINALE'].includes(c.kind)&&c.rescued<2)targets+=this.runeTargets('RESCUE','영혼 구출',c.rescueAt?'<span data-rescue-time>구출 중</span>':`${esc(c.ghostRune)} 문양 · ${c.rescued}/2`,{disabled:Boolean(c.rescueAt),kind:'lk-soul-targets'});
    if(exposed)targets=`<div class="lk-assault">${this.button('STRIKE','집중 공격',{role:'ASSAULT',kind:'lk-strike',icon:'<em aria-hidden="true">⚔</em>'})}${this.button('BURST','결전',{role:'ASSAULT',disabled:!r.burst,kind:'lk-burst',count:r.burst})}<span data-strike-time></span></div>`;
    this.node('targets').innerHTML=targets;
    this.node('targets').className='lk-target-field'+(mechanic&&c.plague&&['CONVERGENCE','FINALE'].includes(c.kind)&&c.rescued<2?' is-dual':'');
    const seals=mechanic&&['CONVERGENCE','FINALE'].includes(c.kind);
    this.node('seals').innerHTML=seals?`<div class="lk-seal-line"><span>${c.sealed?'봉인 해제':'봉인 순서'}</span><div class="lk-sequence">${c.sequence.map((name,i)=>`<span class="${i<c.sealIndex?'done':i===c.sealIndex?'current':''}" aria-label="${esc(name)} ${i<c.sealIndex?'완료':''}">${rune(name)}<small>${esc(name)}</small></span>`).join('<i>›</i>')}</div>${c.sealed?'<b class="lk-seal-complete">완료</b>':`<div class="lk-seal-keys">${RUNES.map(name=>this.button('SEAL',name,{role:'WARDEN',target:name,disabled:c.kind==='FINALE'&&s.souls<3,icon:rune(name),kind:'lk-seal-key'})).join('')}</div>`}</div>`:'';
    let support=this.button('HEAL','회복',{disabled:!r.heal||!['MECHANIC','EXPOSED'].includes(s.step),count:r.heal});
    if(mechanic&&c.plague)support+=this.button('CLEANSE','정화',{disabled:!r.cleanse||c.prison,count:r.cleanse});
    if(mechanic&&c.prison)support+=this.button('SHATTER','감옥 파괴',{role:'ASSAULT',kind:'lk-risk'});
    if(mechanic&&!c.breathResolved&&['PRISON','CONVERGENCE'].includes(c.kind))support+=this.button('GUARD','방벽',{role:'WARDEN',disabled:!r.guard||c.guarded,count:r.guard});
    const dead=(s.partyFighters||s.fighters).find(f=>f.hp<=0);if(dead)support+=this.button('REVIVE','부활',{target:dead.id,disabled:!r.revive||s.souls<1,count:r.revive});
    this.node('support').innerHTML=support;
    this.node('doom').innerHTML=`죽음의 잔재 <b>${s.doom}/3</b>`;
    this.node('souls').innerHTML=`해방된 영혼 <b>${s.souls}</b>${c.kind==='FINALE'?' / 3':''}`;
    this.node('objectives').innerHTML=mechanic?`<span class="${!c.plague?'done':''}">${c.kind==='FINALE'?'왕관 해제':c.prison?'엄폐 유지':'역병 전이'}</span>${c.kind!=='FINALE'?`<span class="${c.interrupted?'done':''}">말살 차단</span>`:''}${seals?`<span class="${c.rescued?'done':''}">영혼 구출</span><span class="${c.sealed?'done':''}">순서 봉인</span>`:''}`:'';
    this.applyPending();
    this.layout();
  }
  layout(){
    const dock=this.host.parentElement.querySelector('[data-v3-dock]'),h=this.host.getBoundingClientRect();
    const bottom=dock?Math.max(0,h.bottom-dock.getBoundingClientRect().top):180;
    this.element.style.setProperty('--lk-dock-space',Math.round(bottom+8)+'px');
  }
  tick(force=false){
    const s=this.state;if(!s?.challenge||!this.engine.app)return;
    const now=(s.status==='ACTIVE'?Date.now()+this.offset:s.finishedAt||s.serverNow);
    const c=projectLichChallenge(s.challenge,now,s.step),key=lichControlKey(s,c);
    if(key!==this.key){this.key=key;this.render(c);}
    if(s.rulesVersion===2){
      const actor=this.engine.combatantById(c.targetId);if(actor&&this.world.visible)this.world.position.set(actor.x,actor.y+8);
      if(force||now-this.lastPaint>=80){this.lastPaint=now;tickCoop(this,c,now);}return;
    }
    this.element.dataset.prison=String(Boolean(c.prison));
    this.element.dataset.urgent=String(s.step==='MECHANIC'&&(c.cast==='SOUL_ANNIHILATION'&&!c.interrupted||c.plague&&c.plagueStacks>=4));
    const actor=this.engine.combatantById(c.targetId);
    if(actor&&this.world.visible){
      this.world.position.set(actor.x,actor.y+8);
      const point=actor.hud.toGlobal({x:110,y:-16});
      const w=this.host.clientWidth,h=this.host.clientHeight;
      const rect=this.host.getBoundingClientRect(),canvas=this.engine.app.canvas.getBoundingClientRect(),screen=this.engine.app.screen;
      const x=point.x*canvas.width/screen.width+canvas.left-rect.left,y=point.y*canvas.height/screen.height+canvas.top-rect.top;
      this.node('host-mark').style.left=Math.max(66,Math.min(w-66,x))+'px';
      this.node('host-mark').style.top=Math.max(150,Math.min(h-220,y))+'px';
    }
    if(!force&&now-this.lastPaint<80)return;this.lastPaint=now;
    this.node('enrage').textContent=time(s.endsAt-Math.max(now,s.startedAt));
    this.node('window').innerHTML=`${s.step==='EXPOSED'?'공격 기회':'작전 제한'} <b>${seconds(c.deadline-now)}s</b>`;
    const castTime=this.node('cast-time');
    if(castTime){
      const lead=c.kind==='PLAGUE'?7000:10000,critical=c.cast==='SOUL_ANNIHILATION';
      const duration=critical?5000:lead,until=c.startedAt+lead+(critical?5000:0)-now;
      castTime.textContent=c.interrupted?'중단':(Math.max(0,until)/1000).toFixed(1)+'s';
      this.node('cast-fill').style.width=(c.interrupted?0:Math.max(0,Math.min(100,until/duration*100)))+'%';
    }
    const rescue=this.node('rescue-time');if(rescue)rescue.textContent=`구출 중 · ${(Math.max(0,c.rescueAt-now)/1000).toFixed(1)}s`;
    const strike=this.node('strike-time');if(strike){
      const cooldown=Math.max(0,1200-(now-c.lastStrikeAt));strike.textContent=cooldown?`다음 공격 ${(cooldown/1000).toFixed(1)}s`:'집중 공격 가능';
      for(const button of this.element.querySelectorAll('[data-action="STRIKE"],[data-action="BURST"]'))button.disabled=this.pending||!this.allowed('ASSAULT')||cooldown>0||button.dataset.action==='BURST'&&!s.resources.burst;
    }
    for(const button of this.element.querySelectorAll('[data-action="TRANSFER"]'))button.disabled=this.pending||!this.allowed('RESCUE')||c.prison||c.plagueStacks<2;
    const stack=this.node('host-mark').querySelector('.lk-host-rune+span');
    if(stack)stack.textContent=c.prison?'서리 감옥 · 엄폐 유지':`죽음의 역병 · ${c.plagueStacks}중첩`;
    this.node('host-mark').querySelectorAll('.lk-stack-pips i').forEach((pip,i)=>pip.classList.toggle('filled',i<c.plagueStacks));
    if(c.prison)this.node('order-help').textContent=`감옥을 지켜라 · 절대영도까지 ${(Math.max(0,c.startedAt+6000-now)/1000).toFixed(1)}s`;
  }
  applyPending(){
    this.node('input-status').hidden=!this.pending;
    if(this.pending)for(const b of this.element.querySelectorAll('[data-action]'))b.disabled=true;
  }
  setPending(value){this.pending=Boolean(value);this.key='';this.tick(true);}
  flash(label,danger){
    const node=this.node('feedback');node.hidden=false;node.textContent=label;node.classList.toggle('is-danger',danger);
    const serial=++this.flashSerial;
    void this.engine.timeline(tl=>{tl.fromTo(node,{opacity:0,y:8},{opacity:1,y:0,duration:.15});tl.to(node,{opacity:0,duration:.2},1.15);},()=>{if(serial===this.flashSerial)node.hidden=true;},1);
  }
  diagnostics(){return {insideV3:this.element.parentElement===this.host,worldLayer:this.world.parent?.label,challengeId:this.state?.challenge?.id,buttons:this.element.querySelectorAll('[data-action]').length};}
  destroy(){this.observer.disconnect();this.engine.app?.ticker.remove(this.onTick);this.element.removeEventListener('click',this.onClick);this.element.removeEventListener('pointerdown',this.onPointerDown);this.element.removeEventListener('pointercancel',this.clearPointer);this.element.removeEventListener('keydown',this.clearPointer);this.element.remove();this.world.destroy({children:true});}
}
