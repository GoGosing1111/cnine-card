import {cards,effectAt} from './catalog.mjs';
const $=selector=>document.querySelector(selector);
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let listLevel=0,selected=cards[0];
const poster=new URLSearchParams(location.search).has('poster');
if(poster){document.body.classList.add('poster');$('#collectionHint').textContent='기본 강화 +0 기준 · 신규 마법카드 8종';}

export function compactEffect(card,level){
 const p=effectAt(card,level),b=value=>`<strong>${value}</strong>`;
 switch(card.slug){
  case 'eclipse-prophecy':return `강한 적을 표식해 아군 피해를 ${b(p.bonus+'%')} 높입니다.<br>처치 시 표식 이전 · 총 ${b('6타')} 적용.`;
  case 'causal-sever':return `${b('3번째 공격')}마다 방어 ${b(p.ignore+'%')} 무시·보호막 ${b(p.pierce+'%')} 관통.<br>회피 불가 · 전투당 ${b('2회')}.`;
  case 'fate-intercept':return `치명타를 받는 아군을 ${b('HP 1')}로 지킵니다. 초과 피해를 ${b(p.mitigation+'%')} 줄여 대신 받습니다.<br>팀당 ${b('1회')}.`;
  case 'overheal-forge':return `초과 회복의 ${b(p.conversion+'%')}를 보호막으로 전환.<br>대상 최대 HP의 ${b(p.cap+'%')}까지 · 팀당 ${b('3회')}.`;
  case 'constellation-shift':return `HP ${b('35% 이하')} 전열·후열 교대.<br>후퇴 아군 게이지 ${b('+'+p.gauge)}, 다음 2타 피해 ${b('-'+p.reduction+'%')}. 팀당 ${b('1회')}.`;
  case 'shield-ledger':return `보호막에 준 피해의 ${b(p.record+'%')} 저장. 파괴 시 기록의 ${b('60%')} 폭발·방어 ${b('-'+p.breakDefense+'%')}.<br>폭발 ${b('1회')}.`;
  case 'fallen-star':return `첫 최종 사망 후 생존 아군 전체 공격력 ${b('+'+p.attack+'%')}, 행동 게이지 ${b('+'+p.gauge)}.<br>팀당 ${b('1회')}.`;
  case 'arcane-mirror':return `상대가 성공한 마법을 ${b(p.efficiency+'%')} 효율로 복제.<br>허용 효과만 ${b('1회')} · 부활·재복제 제외.`;
 }
}
function frame(card,level,eager=false){
 return `<div class="spell-card" style="--accent:${card.accent}"><img class="card-art" src="${card.art}" alt="${escape(card.name)} 원화" loading="${eager?'eager':'lazy'}" decoding="async" width="1024" height="1536"><div class="art-shade"></div><img class="frame" src="magic-frame.svg" alt="" aria-hidden="true"><h3 class="card-title">${card.name}</h3><div class="card-kind"><span>${card.role}</span><span>${card.scopes.join(' · ')}</span></div><div class="effect-caption"><b>마법 효과</b><span>강화 +${level} 기준</span></div><p class="effect-copy">${compactEffect(card,level)}</p><div class="card-index"><span>SEASON II · ${card.number}</span><em>출시 예정</em></div></div>`;
}
function renderGrid(){
 $('#cardGrid').innerHTML=cards.map((card,i)=>`<button class="card-tile" data-card="${card.slug}" aria-label="${card.name} 효과 자세히 보기">${frame(card,listLevel,poster||i<4)}<span class="tile-foot"><b>${card.motif}</b><span>효과 자세히 ↗</span></span></button>`).join('');
 document.querySelectorAll('[data-level]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.level)===listLevel)));
}
function updateDetail(level){
 const p=effectAt(selected,level);
 $('#detailArt').innerHTML=frame(selected,level,true);
 $('#detailRole').textContent=`시즌 2 · ${selected.role} · ${selected.scopes.join(' / ')}`;
 $('#detailTitle').textContent=selected.name;
 $('#detailHook').textContent=selected.hook;
 $('#detailEffect').innerHTML=compactEffect(selected,level);
 $('#levelValue').textContent='+'+level;
 $('#levelRange').value=String(level);
 $('#detailStats').innerHTML=selected.stats.map(s=>`<div><small>${s.label}</small><b>${p[s.key]}${s.unit}</b></div>`).join('');
 $('#detailRules').innerHTML=`<dt>발동</dt><dd>${escape(selected.trigger)}</dd><dt>대상</dt><dd>${escape(selected.target)}</dd><dt>횟수</dt><dd>${escape(selected.limit)}</dd><dt>활용</dt><dd>${escape(selected.synergy)}</dd>`;
 $('#detailAdvantage').textContent=selected.advantage;
 $('#detailTradeoff').textContent=selected.tradeoff;
 $('.detail-copy').style.setProperty('--accent',selected.accent);
}
$('#cardGrid').addEventListener('click',event=>{const tile=event.target.closest('[data-card]');if(!tile)return;selected=cards.find(c=>c.slug===tile.dataset.card);updateDetail(listLevel);$('#cardDetail').showModal();$('#cardDetail').scrollTop=0;$('.close').focus();});
document.querySelectorAll('[data-level]').forEach(button=>button.addEventListener('click',()=>{listLevel=Number(button.dataset.level);renderGrid();}));
$('#levelRange').addEventListener('input',event=>updateDetail(Number(event.target.value)));
$('.close').addEventListener('click',()=>$('#cardDetail').close());
$('#cardDetail').addEventListener('click',event=>{if(event.target===$('#cardDetail'))$('#cardDetail').close();});
renderGrid();
const exportCard=cards.find(c=>c.slug===new URLSearchParams(location.search).get('export'));
if(exportCard){document.body.className='card-export';document.body.innerHTML=frame(exportCard,0,true);}
window.__magicS2Ready=true;
