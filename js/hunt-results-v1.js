(function(global){
 'use strict';
 const ART='/assets/ui/personal-hideout-20261116/',names={STEEL:'회수 철판',WIRE:'구리 배선',CIRCUIT:'제어 회로',COOLANT:'냉각 장치',DRIVE:'구동 부품',CORE:'동력 코어'};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),num=v=>Number(v||0).toLocaleString('ko-KR');
 const money=value=>{const n=Number(value||0);for(const [scale,label] of [[1e16,'경'],[1e12,'조'],[1e8,'억'],[1e4,'만']])if(n>=scale)return (n/scale).toLocaleString('ko-KR',{maximumFractionDigits:2})+label;return num(n);};
 function aggregateRewards(data,sweep){
  const rows=new Map(),add=(name,quantity,image='')=>{if(!(quantity>0))return;const key=name+'|'+image,before=rows.get(key);rows.set(key,{name,image,quantity:Number(quantity)+(before?.quantity||0)});};
  const equipment=sweep?data.equipmentRewards||[]:data.equipmentReward?[data.equipmentReward]:[];
  for(const r of equipment){const items=Array.isArray(r.rewards)?r.rewards:r.items||[r.item||r.equipment||r];for(const item of items)add(item.name||item.rewardName||item.equipmentName||'장비 보상',Number(item.quantity||item.amount||1),item.image||item.imageUrl||item.image_url||'');}
  for(const r of sweep?data.blackMiracleRewards||[]:data.blackMiracleReward?[data.blackMiracleReward]:[])add(r.name||'블랙 미라클',Number(r.quantity||r.amount||1),r.image||'');
  for(const r of (sweep?data.unifiedDrops||[]:data.unifiedDrop?[data.unifiedDrop]:[]).flatMap(r=>r.rewards||[]))add(r.label||r.rewardName||r.name||r.type||'추가 보상',Number(r.quantity||r.amount||1),r.image||r.imageUrl||'');
  const blueprint=data.blueprintDrop;
  if(!sweep&&blueprint)add(blueprint.name,blueprint.quantity,blueprint.image);
  const bonus=data.apocalypseBonus?.rewards;
  if(bonus?.masterStars)add('마스터의 별',bonus.masterStars);if(bonus?.mysticEnergy)add('미스틱 에너지',bonus.mysticEnergy);
  return [...rows.values()];
 }
 function battleDetails(data,playerPower,opponentPower,battleSuit){
  const result=data.battleV2?.result||{},stat=(label,value)=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>';
  let rows=stat('아군 전투력',num(playerPower||data.playerPower))+stat('몬스터 전투력',num(opponentPower||data.monsterPower));
  for(const [side,label] of [['A','아군'],['B','상대']]){const team=[...(result.final?.[side]||[]),...(result.final?.mercenaries?.[side]||[])];if(team.length)rows+=stat(label+' 생존',team.filter(c=>Number(c.hp)>0).length+' / '+team.length);}
  if(result.actions)rows+=stat('전투 행동',num(result.actions)+'회');
  return '<dl>'+rows+'</dl>'+(battleSuit?'<p data-battle-suit-live-result="SERVER_TIMELINE">'+esc(battleSuit.name)+' · 피해 '+num(battleSuit.damage)+' · '+num(battleSuit.actions)+'회 사격</p>':'');
 }
 function render(data,{sweep=false,win=data.result==='WIN',playerPower=0,opponentPower=0,battleSuit=null}={}){
  const count=sweep?Number(data.battles||0):1,wins=sweep?Number(data.wins||0):(win?1:0),parts=sweep?data.hideoutRewards||{}:data.hideoutReward||{},loot=aggregateRewards(data,sweep);
  const coins=sweep?data.totalReward:Number(data.reward||0)+Number(data.apocalypseBonus?.rewards?.coin||0),crystals=sweep?data.magicCrystalTotal:data.magicReward?.amount;
  const title=sweep?'토벌 결과 정산':win?'토벌 성공':'토벌 종료',id=sweep?'pveSweepConfirm':'pveResultConfirm';
  return '<section class="hunt-report '+(win||wins?'is-win':'is-loss')+'" aria-label="몬스터 토벌 결과"><header><span>REVERSE CALL · FIELD REPORT</span><h2>'+title+'</h2><p>'+esc(data.monster?.name||'몬스터 토벌')+' · '+num(count)+'회 완료</p></header><div class="hunt-report-summary"><div><small>승리 / 패배</small><strong>'+num(wins)+' / '+num(count-wins)+'</strong></div><div><small>획득 코인</small><strong title="'+num(coins)+' 코인" aria-label="'+num(coins)+' 코인">+'+money(coins)+'</strong></div>'+(crystals>0?'<div><small>마력 수정</small><strong>+'+num(crystals)+'</strong></div>':'')+'</div><div class="hunt-report-scroll">'+(Object.values(parts).some(v=>v>0)?'<section class="hunt-report-parts"><h3>은신처 부품</h3><p>부품 보관함에 저장했습니다.</p><div>'+Object.entries(parts).filter(([c,q])=>names[c]&&q>0).map(([c,q])=>'<article><img src="'+ART+'part-'+c.toLowerCase()+'.webp" alt="" width="80" height="80"><span>'+names[c]+'</span><b>+'+num(q)+'</b></article>').join('')+'</div></section>':'')+(data.apocalypseChallenge?'<p class="v3-report-adjustment">충격파 회피 · '+(data.apocalypseChallenge.success?'성공':data.apocalypseFailure==='MECHANIC_FAILED'?'실패 · 전원 전멸':'실패 · 전투 중단')+'</p>':'')+'<section class="hunt-report-loot"><h3>획득 전리품</h3>'+(loot.length?'<ul>'+loot.map(r=>'<li>'+(r.image?'<img src="'+esc(r.image)+'" alt="" width="42" height="42" loading="lazy">':'')+'<span>'+esc(r.name)+'</span><b>×'+num(r.quantity)+'</b></li>').join('')+'</ul>':'<p>추가 전리품 없음</p>')+'</section><details><summary>전투 상세</summary>'+(sweep?'<p>'+num(count)+'회 중 '+num(wins)+'회 승리했습니다. 동일 보상은 합산해 표시합니다.</p>':battleDetails(data,playerPower,opponentPower,battleSuit))+(sweep&&data.cappedByEnergy?'<p>실제 소모된 행동력과 완료한 전투만 반영했습니다.</p>':'')+'</details></div><footer><p>보상은 자동 지급되었습니다.</p><button type="button" id="'+id+'" class="hunt-report-confirm">토벌 화면으로 돌아가기</button></footer></section>';
 }
 global.HuntResults={render,aggregateRewards};
})(window);
