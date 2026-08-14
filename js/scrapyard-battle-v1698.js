(()=>{
  'use strict';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const preload=src=>new Promise(resolve=>{if(!src)return resolve();const image=new Image(),done=()=>resolve();image.onload=done;image.onerror=done;image.src=src;if(image.complete)resolve();setTimeout(done,7000)});
  window.playScrapyardBattleV1698=async(result,helpers={})=>{
    const modal=document.getElementById('modal');if(!modal)return;
    const esc=helpers.esc||String,fmt=helpers.fmt||(value=>Number(value||0).toLocaleString('ko-KR')),asset=helpers.asset||(value=>String(value||'')),normalizeImages=helpers.normalizeImages||(()=>{}),showResult=helpers.showResult;
    const cards=Array.isArray(result.deckCards)?result.deckCards:[],waves=Array.isArray(result.waves)?result.waves:[],fx=window.SoopBattleFxV1698||{};
    const fallbackFighter=(card,index)=>{const type=String(card?.uniqueAbility?.dominantType||'').toLowerCase();return `<div class="battle-card-fighter${type?` unique-card-fx-host unique-fx-${type}`:''}" data-fighter="${index}" ${type?`data-unique-fx="${type}"`:''}><div class="fighter-aura"></div><article class="ws98-fallback-card"><em>${esc(card.rarity||card.grade||'C')}</em><img src="${esc(asset(card.image))}" alt=""><b>${esc(card.title||'카드')}</b></article></div>`};
    const fighter=(card,index)=>`<div class="ws98-fighter-slot" data-fighter-wrap="${index}">${typeof fx.fighterHtml==='function'?fx.fighterHtml(card,index):fallbackFighter(card,index)}<div class="ws98-card-hp"><i></i><span>100%</span></div></div>`;
    modal.className='modal show ws76-battle-modal ws98-battle-modal';
    modal.innerHTML=`<section class="ws76-battle ws98-battle"><div class="battle-fx-layer"></div><header><div><small>SCRAPYARD · PVE COMBAT LINK</small><h2 id="wsWaveTitle">폐차장 전투 준비</h2></div><div class="ws98-header-state"><span id="ws98Phase">TARGET SCAN</span><button id="wsBattleSkip">결과로 건너뛰기</button></div></header><div class="ws98-combat-hud"><span><small>활성 전투력</small><b>${fmt(result.deckPower)}</b>${Number(result.deckPower||0)>Number(result.baseDeckPower||result.deckPower||0)?`<em>고유효과 +${fmt(Number(result.deckPower)-Number(result.baseDeckPower||0))}</em>`:''}</span><span><small>원정대 내구도</small><b id="ws98PartyHp">100%</b></span><span><small>전투 구역</small><b>${esc(result.difficulty?.name||'폐차장')}</b></span></div><div class="ws76-battlefield"><div class="ws76-party">${cards.map(fighter).join('')}</div><div class="ws76-monster battle-enemy-card" id="wsMonster"><div><small id="wsMonsterTag">WAVE TARGET</small><b id="wsMonsterName">접근 중</b><span><i id="wsMonsterHp"></i></span></div><img id="wsMonsterImage" alt=""><strong id="wsDamage"></strong><i class="ws98-monster-core"></i></div><div class="ws98-counter-damage" id="ws98CounterDamage"></div><div class="ws98-unique-banner" id="ws98UniqueBanner"><small>UNIQUE ABILITY</small><b>고유효과 발동</b></div></div><footer><div class="ws76-wave-dots">${Array.from({length:Number(result.difficulty?.waves||waves.length)},(_,index)=>`<i data-wave-dot="${index}"></i>`).join('')}</div><span id="wsBattleLog">전용 타깃 데이터를 불러오는 중입니다.</span></footer></section>`;
    normalizeImages(modal);
    const stage=modal.querySelector('.ws98-battle'),phase=modal.querySelector('#ws98Phase'),log=modal.querySelector('#wsBattleLog'),monster=modal.querySelector('#wsMonster'),image=modal.querySelector('#wsMonsterImage'),hp=modal.querySelector('#wsMonsterHp'),damage=modal.querySelector('#wsDamage'),partyHpText=modal.querySelector('#ws98PartyHp'),counterDamage=modal.querySelector('#ws98CounterDamage'),uniqueBanner=modal.querySelector('#ws98UniqueBanner');
    let skip=false;modal.querySelector('#wsBattleSkip').onclick=()=>{skip=true};
    await Promise.all([...new Set(waves.map(wave=>asset(wave?.monster?.image)).filter(Boolean))].map(preload));
    if(!stage.isConnected)return;
    let uniquePlayed=false;
    for(let wi=0;wi<waves.length&&!skip;wi++){
      const wave=waves[wi];
      stage.classList.toggle('boss-wave',Boolean(wave.boss));monster.classList.toggle('boss',Boolean(wave.boss));monster.classList.remove('enter','hit','counter');
      modal.querySelector('#wsWaveTitle').textContent=`WAVE ${wave.wave} / ${result.difficulty.waves}`;phase.textContent=wave.boss?'FINAL BOSS':'ENCOUNTER';modal.querySelector('#wsMonsterTag').textContent=wave.boss?'SCRAPYARD FINAL BOSS':'SALVAGE TARGET';modal.querySelector('#wsMonsterName').textContent=wave.monster.name;image.src=asset(wave.monster.image);hp.style.width='100%';modal.querySelector(`[data-wave-dot="${wi}"]`)?.classList.add('active');log.textContent=`${wave.monster.name} 조우 · 전투 준비`;
      await sleep(wave.boss?760:480);monster.classList.add('enter');stage.classList.add('cards-ready');await sleep(wave.boss?820:520);
      if(!uniquePlayed&&result.uniqueAbility?.battleEffects?.events?.length&&typeof fx.playUnique==='function'){
        uniquePlayed=true;uniqueBanner.classList.add('show');uniqueBanner.querySelector('b').textContent=`${result.uniqueAbility.battleEffects.events.length}개 고유효과 연동`;await fx.playUnique(stage,phase,log,result.uniqueAbility,cards,false);uniqueBanner.classList.remove('show');phase.textContent='BATTLE';await sleep(140);
      }
      for(const turn of wave.turns||[]){
        if(skip)break;
        const index=Math.max(0,Math.min(cards.length-1,Number(turn.cardIndex||0))),fighterNode=modal.querySelector(`[data-fighter="${index}"]`);
        fighterNode?.classList.add('attack','active-attacker');monster.classList.add('hit');damage.textContent=`-${fmt(turn.damage)}${turn.critical?' CRITICAL':''}`;damage.className=turn.critical?'critical':'show';hp.style.width=`${Math.max(0,Number(turn.enemyHp||0)/Math.max(1,Number(wave.monster.maxHp||1))*100)}%`;phase.textContent=turn.critical?'CRITICAL STRIKE':'CARD ATTACK';log.textContent=`${cards[index]?.title||'카드'} 공격 · ${fmt(turn.damage)} 피해`;fx.burst?.(stage,'76%','48%',turn.critical?28:14);
        await sleep(260);fighterNode?.classList.remove('attack','active-attacker');monster.classList.remove('hit');damage.className='';
        if(Number(turn.counterDamage||0)>0){
          const partyHp=Math.max(0,Number(turn.partyHp??100));monster.classList.add('counter');counterDamage.textContent=`원정대 -${fmt(turn.counterDamage)}`;counterDamage.classList.add('show');partyHpText.textContent=`${Math.round(partyHp)}%`;modal.querySelectorAll('.ws98-card-hp').forEach(bar=>{bar.querySelector('i').style.width=`${partyHp}%`;bar.querySelector('span').textContent=`${Math.round(partyHp)}%`});phase.textContent='ENEMY COUNTER';await sleep(220);monster.classList.remove('counter');counterDamage.classList.remove('show');
        }
        await sleep(80);
      }
      const dot=modal.querySelector(`[data-wave-dot="${wi}"]`);dot?.classList.add(wave.won?'clear':'fail');
      if(!wave.won){phase.textContent='PARTY WIPED';log.textContent='원정대 전멸 · 클리어한 웨이브까지만 기록합니다.';stage.classList.add('party-wiped')}
      else{phase.textContent=wave.boss?'BOSS DESTROYED':'WAVE CLEAR';log.textContent=`WAVE ${wave.wave} 정리 완료`;stage.classList.add('wave-clear')}
      await sleep(wave.boss?880:520);stage.classList.remove('wave-clear');monster.classList.remove('enter');
    }
    if(typeof showResult==='function')showResult(modal,result);
  };
})();
