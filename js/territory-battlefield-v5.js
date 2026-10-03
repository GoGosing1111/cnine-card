(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt = value => Number(value || 0).toLocaleString('ko-KR');
  const iconPaths = {
    RELAY:'M12 3 4 19h16L12 3Zm0 5v7m-5 0h10M8 11h8M2 4a16 16 0 0 1 20 0M5 6a11 11 0 0 1 14 0',
    SUPPLY:'M3 6h14v12H3V6Zm14 5h3l2 4v3h-5M7 18a2 2 0 1 0 .01 0M18 18a2 2 0 1 0 .01 0M6 10h7M6 13h5',
    SIEGE:'M3 17h17v3H3v-3Zm4 0 3-5h5l3 5M10 12l10-7 2 3-8 6M3 9l5 2M5 5l4 4',
    EMP_PULSE:'M13 2 5 13h6l-1 9 9-13h-6V2ZM3 7l-2 2m20 6 2 2M5 20l-2 2',
    WALL_BREAKER:'M3 4h18v16H3V4Zm6 0v7h6v9M3 11h6m6 0h6M10 7l4 4-3 4 3 3',
    ENGINEER:'M4 20 14 10m0 0a6 6 0 0 1-5-8l4 4 4-4a6 6 0 0 1-3 8ZM3 17l4 4',
    SIEGE_CANNON:'M2 18h20M5 18v-4h13v4M10 14l10-9 2 3-8 6M4 4l3 3m3-6v4'
  };
  const icon = code => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(iconPaths[code] || iconPaths.SIEGE)+'"/></svg>';

  const locations=['서부 본성','서부 참호선','철교 보급로','폐허 외곽','중앙 지휘 구역','동부 교량','동부 포대','산악 관문','동부 본성'];
  const label=(state,side)=>state.settings?.[side==='A'?'teamAName':'teamBName']||side+' 진영';
  let objective='SIEGE',fieldOpen=false,lastFieldId=0,fxOn=true,callbacks={},current=null,mount=null,engine=null,clockOffset=0;
  const now=()=>Date.now()+clockOffset;
  const untilText=value=>value>now()?Math.ceil((value-now())/1000)+'초':'가동 중';
  const art=(key,alt)=>'<picture class="tw6-device-art" style="--facility-art:url(/assets/ui/territory-war/battlefield-v5/'+key+'-320.webp)"><source media="(max-width:820px)" srcset="/assets/ui/territory-war/battlefield-v5/'+key+'-320.webp"><img src="/assets/ui/territory-war/battlefield-v5/'+key+'-640.webp" alt="'+escape(alt)+'" loading="lazy" decoding="async"><span aria-hidden="true"></span></picture>';
  try{fxOn=localStorage.getItem('cnine-territory-fx')!=='OFF'}catch{}
  function stageHtml(state){
    const bf=state.battlefield,index=Number(state.round?.current_front_index??4),title=index===0?label(state,'A')+' 본성':index===8?label(state,'B')+' 본성':locations[index],hp=side=>{const p=side.toLowerCase();return Math.max(0,Math.min(100,Number(state.front?.[p+'_hp']||0)/Math.max(1,Number(state.front?.[p+'_max_hp']||1))*100))};
    return '<section class="tw6-field" data-front-index="'+index+'" data-damage-a="'+Math.floor((100-hp('A'))/25)+'" data-damage-b="'+Math.floor((100-hp('B'))/25)+'" aria-label="'+escape(title)+' 전장"><picture class="tw6-field-art"><source media="(max-width:820px)" srcset="/assets/ui/territory-war/battlefield-v5/battlefield-panorama-960.webp"><img src="/assets/ui/territory-war/battlefield-v5/battlefield-panorama-1600.webp" alt="참호와 철교, 포대가 펼쳐진 공성 전장"></picture><div class="tw6-field-vignette"></div><div class="tw6-weather"></div><div class="tw6-damage side-a"></div><div class="tw6-damage side-b"></div><div class="tw6-canvas-mount"></div><header class="tw6-front-title"><span><i></i> '+(state.truce?.active?'휴전 중':state.round?.status==='ACTIVE'?'현재 교전지':'전선 준비')+' · '+String(index+1).padStart(2,'0')+'</span><h2>'+escape(title)+'</h2><p>'+escape(state.mine?.side?'내 소속 · '+label(state,state.mine.side):'전황 관전 중')+'</p></header><nav class="tw6-field-navigation" aria-label="전장 이동"><button data-tw6-return-map>← 전선으로 돌아가기</button><button data-tw6-fx aria-pressed="'+fxOn+'">연출 '+(fxOn?'ON':'OFF')+'</button></nav><div class="tw6-fort-status side-a"><span>'+escape(label(state,'A'))+' 방벽</span><b>'+Math.round(hp('A'))+'<small>%</small></b><em>'+wallLabel(hp('A'))+'</em></div><div class="tw6-fort-status side-b"><span>'+escape(label(state,'B'))+' 방벽</span><b>'+Math.round(hp('B'))+'<small>%</small></b><em>'+wallLabel(hp('B'))+'</em></div>'+(bf?'<button class="tw6-relay-anchor" data-tw4-drawer="facilities"><img src="/assets/ui/territory-war/battlefield-v5/relay-320.webp" alt=""><span>전력 중계탑</span><b>'+escape(bf.relay.owner?label(state,bf.relay.owner)+' 확보':'중립 시설')+'</b></button><div class="tw6-cannon-warning" aria-live="polite">'+warningHtml(state)+'</div>':'')+'<div class="tw6-live-sitrep" role="status"><span><i></i> 전황 LIVE</span><b>'+escape(state.notice?.title||'현재 전선 동기화')+'</b><small>양 진영 방벽 HP 차이 '+Math.abs(hp('A')-hp('B')).toFixed(1)+'%P</small></div><div class="tw6-cut-in" role="status" aria-live="polite"></div></section>'+(bf?objectiveHtml(state):'');
  }
  function wallLabel(hp){return hp>70?'방벽 유지':hp>40?'외벽 손상':hp>10?'방어선 붕괴':'함락 임박'}
  function warningHtml(state){const bf=state.battlefield;if(!bf)return'';return ['A','B'].filter(side=>bf[side].cannonDueAt>0).map(side=>'<div><i></i><span>'+escape(label(state,side))+' 공성포 발사 예고</span><b data-tw6-due="'+bf[side].cannonDueAt+'">'+untilText(bf[side].cannonDueAt)+'</b></div>').join('')}
  function objectiveHtml(state){
    const can=state.mine?.side&&state.round?.status==='ACTIVE'&&!state.truce?.active;
    if(objective==='SUPPLY'&&!state.battlefield?.supply?.active)objective='SIEGE';
    return '<nav class="tw6-objectives" aria-label="이번 교전 목표">'+[['SIEGE','전선 공성','적 방벽 타격'],['RELAY','중계탑 확보','공성 강화 · EMP 해금'],['SUPPLY','열차 호위',state.battlefield.supply.active?'전력 · 행동력 · 공성 강화':'다음 열차 대기']].map(([code,name,help])=>'<button data-tw6-objective="'+code+'" aria-pressed="'+(objective===code)+'" '+(!can||code==='SUPPLY'&&!state.battlefield.supply.active?'disabled':'')+'>'+icon(code)+'<span><b>'+name+'</b><small>'+help+'</small></span></button>').join('')+'</nav>';
  }
  function facilitiesHtml(state){
    const bf=state.battlefield;if(!bf)return'<div class="tw6-empty"><h3>전장 시설 준비</h3><p>시설은 개편 규칙으로 편성된 회차에서 사용할 수 있습니다.</p></div>';
    const side=state.mine?.side||'A',team=bf[side],enemy=side==='A'?'B':'A',disabled=team.disabledUntil>now(),chargePct=Math.min(100,team.charge/bf.config.chargeMax*100),relayPct=(bf.relay.goal-bf.relay.meter)/(bf.relay.goal*2)*100,can=state.round?.status==='ACTIVE'&&!state.truce?.active&&state.mine?.side,cannon=state.counter?.[side]?.skills?.SIEGE_CANNON,ready=Boolean(can&&state.counter?.canActivate&&cannon?.ready&&team.charge>=bf.config.chargeMax&&!disabled&&!team.cannonDueAt);
    const cards=[
      ['relay','푸른 전력 코어를 품은 중계탑과 방어 포대','01 / POWER RELAY',bf.relay.owner?label(state,bf.relay.owner)+' 확보':'중립 시설','전력 중계탑','점령 즉시 진영 전력 +'+bf.config.relayCaptureCharge+'. 유지 중 공성 피해 +'+bf.config.relaySiegeBonusPercent+'%, 교전마다 전력 +'+bf.config.relayChargeBonus+'.<br>확보 진영 지휘관은 EMP 파동을 사용할 수 있습니다. 상대 진영도 교전으로 탈환할 수 있습니다.','<div class="tw6-relay-meter"><span>'+escape(label(state,'A'))+'</span><em><i style="left:'+relayPct+'%"></i></em><span>'+escape(label(state,'B'))+'</span></div><button class="tw6-secondary" data-tw6-select="RELAY" '+(!can?'disabled':'')+'>중계탑 확보 교전 '+icon('RELAY')+'</button>'],
      ['supply','보급 화물을 싣고 철교를 통과하는 장갑 수송열차','02 / ARMORED SUPPLY',bf.supply.winner?label(state,bf.supply.winner)+' 호위 성공':bf.supply.active?'보급열차 진입':'다음 열차 대기','보급 수송열차','호위 '+bf.config.supplyGoal+'점 달성 시 진영 전력 +'+bf.config.supplyCaptureCharge+', '+bf.config.supplyBuffSeconds+'초간 공성 피해 +'+bf.config.supplySiegeBonusPercent+'%.<br>호위 성공 진영의 해당 열차 참여자는 행동력 +'+bf.config.supplyEnergy+'를 1회 수령합니다. 최대치 내 회복.','<div class="tw6-supply-score"><b>'+escape(label(state,'A'))+' <em>'+bf.supply.aPoints+'</em></b><span>/ '+bf.supply.goal+'</span><b>'+escape(label(state,'B'))+' <em>'+bf.supply.bPoints+'</em></b></div><div class="tw6-facility-actions"><button class="tw6-secondary" data-tw6-select="SUPPLY" '+(!can||!bf.supply.active?'disabled':'')+'>'+(bf.supply.active?'열차 호위 교전':'다음 열차 대기')+' '+icon('SUPPLY')+'</button>'+(bf.supplyClaim?'<button class="tw6-primary" data-tw6-supply-claim="'+bf.supplyClaim.cycle+'" '+(!can||disabled?'disabled':'')+'>행동력 +'+bf.supplyClaim.energy+' 수령</button>':'')+'</div>'],
      ['cannon','연두빛 코어를 충전하는 거대 장거리 공성포','03 / SIEGE CANNON',disabled?'시설 정지 · '+untilText(team.disabledUntil):team.cannonDueAt?'발사 준비 · '+untilText(team.cannonDueAt):team.charge>=bf.config.chargeMax?'발사 준비 완료':'진영 전력 충전 중','거대 공성포',bf.config.cannonWarningSeconds+'초 예고 후 적 최대 HP '+bf.config.cannonHpPercent+'% 타격.<br>'+escape(label(state,enemy))+' 대포병 반격으로 피해가 감소합니다.','<div class="tw6-charge"><em><i style="width:'+chargePct+'%"></i></em><b>'+team.charge+' <small>/ '+bf.config.chargeMax+'</small></b></div><button class="tw6-primary" data-tw3-operation="SIEGE_CANNON" '+(!ready?'disabled':'')+'>'+(team.cannonDueAt?'발사 예약 완료':!state.counter?.isCommander?'지휘관 발사 권한':ready?'거대 공성포 발사':disabled?'시설 복구 필요':'전력 충전 / 스킬 대기')+' '+icon('SIEGE_CANNON')+'</button>']
    ];
    const merits={relay:[['+'+bf.config.relaySiegeBonusPercent+'%','점령 중 공성 피해'],['+'+bf.config.relayCaptureCharge,'점령 즉시 전력'],['EMP','점령 스킬 해금']],supply:[['+'+bf.config.supplyEnergy,'참여자 행동력'],['+'+bf.config.supplyCaptureCharge,'호위 성공 전력'],['+'+bf.config.supplySiegeBonusPercent+'%',bf.config.supplyBuffSeconds+'초 공성 강화']],cannon:[[bf.config.cannonHpPercent+'%','적 최대 HP 피해'],[bf.config.cannonDisableSeconds+'초','적 시설 마비'],[bf.config.chargeMax,'발사 필요 전력']]};
    return '<header class="tw6-facility-heading"><span>현재 교전 거점 · '+escape(locations[Number(state.round?.current_front_index??4)])+'</span><h3>전장 시설</h3><p>확보·호위는 행동력을 사용한 실제 교전입니다. 공성 피해 대신 시설 기여를 얻습니다.</p></header>'+cards.map(([key,alt,code,badge,title,description,controls])=>'<article class="tw6-facility tw6-'+key+'">'+art(key,alt)+'<div class="tw6-facility-copy"><span class="tw6-device-code">'+code+'</span><span class="tw6-device-badge">'+escape(badge)+'</span><h4>'+title+'</h4><div class="tw6-merits">'+merits[key].map(([value,help])=>'<span><b>'+value+'</b><small>'+help+'</small></span>').join('')+'</div><p>'+description+'</p>'+controls+'</div></article>').join('')+'<footer class="tw6-contribution"><span>내 전선 기여</span><b>시설 '+fmt(bf.mine.points)+'점</b><b>전력 '+fmt(bf.mine.charge)+'</b></footer>';
  }
  function skillBlock(state,code){
    const bf=state.battlefield,side=state.mine?.side;if(!bf||!side)return'';
    const team=bf[side];
    if(code==='EMP_PULSE'&&bf.relay.owner!==side)return'중계탑 점령 필요';
    if(code==='ENGINEER'&&team.disabledUntil<=now())return'복구할 시설 없음';
    if(code==='SIEGE_CANNON'){if(team.cannonDueAt)return'발사 예약 완료';if(team.disabledUntil>now())return'시설 정지';if(team.charge<bf.config.chargeMax)return'전력 '+team.charge+'/'+bf.config.chargeMax}
    return'';
  }
  function attach(root,state,options={}){
    mount=root;current=state;callbacks=options;if(state.serverNow)clockOffset=Date.parse(state.serverNow)-Date.now();
    const map=root.querySelector('.tw4-map-shell');if(!map)return;map.classList.add('tw6-equipped');if(lastFieldId&&lastFieldId!==Number(state.front?.id))fieldOpen=false;lastFieldId=Number(state.front?.id||0);map.dataset.tw6View=fieldOpen?'FIELD':'MAP';document.body.classList.toggle('territory-battlefield-entered',fieldOpen);root.querySelectorAll('[data-tw6-enter]').forEach(button=>button.onclick=()=>showField(true));root.querySelector('[data-tw6-return-map]')?.addEventListener('click',()=>showField(false));
    root.querySelector('[data-tw6-fx]')?.addEventListener('click',event=>{fxOn=!fxOn;try{localStorage.setItem('cnine-territory-fx',fxOn?'ON':'OFF')}catch{}event.currentTarget.textContent='연출 '+(fxOn?'ON':'OFF');event.currentTarget.setAttribute('aria-pressed',fxOn);engine?.setEnabled(fxOn)});
    root.querySelectorAll('[data-tw6-objective],[data-tw6-select]').forEach(button=>button.onclick=()=>{
      objective=button.dataset.tw6Objective||button.dataset.tw6Select;
      root.querySelectorAll('[data-tw6-objective]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tw6Objective===objective));
      root.querySelectorAll('[data-tw3-attack] b').forEach(b=>b.textContent=objective==='RELAY'?'중계탑 확보':objective==='SUPPLY'?'열차 호위':'공성 교전 시작');
      if(button.dataset.tw6Select){options.closeDrawer?.();showField(true)}
    });
    root.querySelectorAll('[data-tw6-supply-claim]').forEach(button=>button.onclick=()=>options.claimSupply?.(Number(button.dataset.tw6SupplyClaim)));
    root.querySelectorAll('[data-tw3-attack] b').forEach(b=>b.textContent=objective==='RELAY'?'중계탑 확보':objective==='SUPPLY'?'열차 호위':'공성 교전 시작');
    if(!engine)engine=new BattlefieldFx();
    engine.attach(root.querySelector('.tw6-canvas-mount'),root.querySelector('.tw6-cut-in'));engine.setEnabled(fxOn);engine.sync(state);tick();
  }
  function showField(open){fieldOpen=Boolean(open);document.body.classList.toggle('territory-battlefield-entered',fieldOpen);const map=mount?.querySelector('.tw4-map-shell');if(map)map.dataset.tw6View=fieldOpen?'FIELD':'MAP';mount?.querySelector('.tw4-shell')?.classList.remove('zone-open');tick()}
  function tick(){
    mount?.querySelectorAll('[data-tw6-due]').forEach(node=>node.textContent=untilText(Number(node.dataset.tw6Due)));
    const map=mount?.querySelector('.tw4-map-shell');engine?.setPaused(document.hidden||Boolean(current?.truce?.active)||current?.round?.status!=='ACTIVE'||map?.dataset.tw6View!=='FIELD'||Boolean(document.querySelector('.tw6-personal-battle')));
  }
  class BattlefieldFx{
    constructor(){this.renderer=new globalThis.CNineTerritoryArtilleryFx();this.seen=new Set();this.baseline=null;this.enabled=true;this.paused=true;}
    attach(target,cutin){this.cutin=cutin;this.renderer.attach(target);}
    setEnabled(value){this.enabled=value;this.renderer.setEnabled(value);}
    setPaused(value){this.paused=value;this.renderer.setPaused(value);}
    sync(state){
      const key=state.round?.id+':'+state.front?.id,events=(state.battlefield?.events||[]).slice().reverse(),actions=(state.recentActionPulse||state.recentActions||[]).slice().reverse();
      if(this.baseline!==key){this.baseline=key;this.renderer.clear();this.seen.clear();for(const event of events)this.seen.add(event.id);for(const action of actions)this.seen.add('action:'+action.id);this.notice=state.notice?.id;return;}
      for(const event of events)if(!this.seen.has(event.id)){this.seen.add(event.id);if(now()-event.created_at_ms<90000)this.play(event.type,event.side,event.payload);}
      if(state.notice?.id&&state.notice.id!==this.notice){this.notice=state.notice.id;if(state.notice.type==='TACTICAL_OPERATION')this.play(state.notice.payload?.operation,state.notice.side,state.notice.payload);}
      let count=0;for(const action of actions)if(!this.seen.has('action:'+action.id)){this.seen.add('action:'+action.id);if(count++<3)this.play('SHOT',action.side,{});}
      if(this.seen.size>300)this.seen=new Set([...this.seen].slice(-150));
    }
    play(type,side,payload={}){
      if(!this.enabled||this.paused)return;
      const playback=this.renderer.play(type,side);
      const titles={EMP_PULSE:'EMP 파동 · 시설 정지',WALL_BREAKER:'성벽 파쇄탄',ENGINEER:'공병 투입 · 시설 복구',SIEGE_CANNON:'거대 공성포 · 발사 준비',CANNON_FIRED:'거대 공성포 착탄',RELAY_CAPTURED:'전력 중계탑 확보',SUPPLY_SECURED:'보급열차 호위 성공',CARPET_BOMBING:'융단폭격 개시',SPG_BARRAGE:'자주포 포격',AIR_DEFENSE:'통합 대공망 전개',COUNTER_BATTERY:'대포병 반격',IRON_WALL:'철벽 방어 전개',ASSAULT:'총공세 개시',INFILTRATION:'기습 침투',REGROUP:'재집결 돌파'};
      if(this.cutin&&titles[type]){this.cutin.className='tw6-cut-in side-'+String(side).toLowerCase()+' is-live';this.cutin.innerHTML='<span>'+escape(current?label(current,side):side)+'</span><b>'+titles[type]+'</b>'+(Number(payload.damage)>0?'<em>공성 피해 '+fmt(payload.damage)+'</em>':'');clearTimeout(this.cutinTimer);this.cutinTimer=setTimeout(()=>this.cutin?.classList.remove('is-live'),3200);}
      return playback;
    }
    destroy(){clearTimeout(this.cutinTimer);this.renderer.destroy();}
  }

  globalThis.CNineTerritoryBattlefield={stageHtml,facilitiesHtml,skillBlock,attach,tick,objective:()=>objective,attackPayload:()=>({objective,frontId:Number(current?.front?.id||0),...(objective==='SUPPLY'?{supplyCycle:current?.battlefield?.supply?.cycle}: {})}),dispose(){engine?.destroy();engine=null;mount=null;current=null;document.body.classList.remove('territory-battlefield-entered');objective='SIEGE';fieldOpen=false;lastFieldId=0;},playPreview(type,side='A'){return engine?.play(type,side,{damage:1500000});},diagnostics(){return engine?.renderer.diagnostics()||{ready:false};},previewControl(action,value){return engine?.renderer.control(action,value);}};
})();
