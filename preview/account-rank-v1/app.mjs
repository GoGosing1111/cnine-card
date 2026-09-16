import {RANKS,rankForLevel,normalizeLevel,percent} from './model.mjs';
const $=id=>document.getElementById(id);
let level=250,selected=rankForLevel(level);
const badge=(rank,size)=>`<img class="badge-img" src="assets/${rank.art}" alt="${rank.name} 계급" width="${size}" height="${size}">`;
const range=r=>r.min===r.max?`Lv.${r.min}`:`Lv.${r.min}–${r.max}`;
const nav=window.SoopketmonV21NavigationContract;
if(nav)$('shared-navigation').innerHTML=nav.menuGroupOrder.map(id=>`<span class="nav-label">${nav.groups[id].title}</span>`).join('');
$('rank-select').innerHTML=RANKS.map(r=>`<option value="${r.code}">${r.name} · ${range(r)}</option>`).join('');
$('display-rank-select').innerHTML=$('rank-select').innerHTML;
$('rank-list').innerHTML=RANKS.map(r=>`<button class="rank-row" data-rank="${r.code}" aria-pressed="false"><span class="rank-thumb">${badge(r,36)}</span><span><b>${r.name}</b><small>${range(r)}</small></span><span class="row-mark">${r.insignia}</span></button>`).join('');
function update(){
  selected=rankForLevel(level);const r=selected,next=RANKS[r.index+1];
  $('rank-select').value=r.code;$('display-rank-select').value=r.code;$('level-input').value=level;
  document.querySelectorAll('[data-rank]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rank===r.code)));
  const list=$('rank-list'),active=list.querySelector(`[data-rank="${r.code}"]`);
  if(list.getClientRects().length&&active){const a=active.getBoundingClientRect(),b=list.getBoundingClientRect();if(matchMedia('(max-width:540px)').matches)list.scrollLeft+=a.left-b.left-list.clientWidth/2+a.width/2;else list.scrollTop+=a.top-b.top-list.clientHeight/2+a.height/2;}
  $('stage-group').textContent=`${r.group} / ${String(r.index+1).padStart(2,'0')}`;$('stage-range').textContent=range(r);$('rank-stage').dataset.tone=r.tone;
  $('large-art').innerHTML=badge(r,224);
  $('stage-code').textContent=r.code.replaceAll('_',' ');$('stage-name').textContent=r.name;
  $('stage-caption').textContent=`숲켓몬 ${r.group} 계급장`;
  $('attack').textContent=`+${percent(r.attackBp)}`;$('hp').textContent=`+${percent(r.hpBp)}`;$('coins').textContent=`+${percent(r.coinBp)}`;$('presets').textContent=`${r.presetSlots}칸`;
  $('cosmetic').textContent=`${r.name} 계급 외형`;$('next-rank').textContent=next?`${next.name} · Lv.${next.min}`:'최고 계급 · 원수';$('next-rule').textContent=next?`진급까지 ${next.min-level}레벨`:'250레벨 달성';
  $('header-rank').innerHTML=badge(r,36);$('header-level').textContent=`${r.name} · Lv.${level}`;
  $('card-rank').innerHTML=badge(r,96);$('card-rank-label').innerHTML=`${r.name}<small>Lv.${level} · 계정 계급</small>`;
  $('card-service').textContent=`${r.name} · Lv.${level}`;
  $('card-next').textContent=next?`다음 진급 ${next.name} · Lv.${next.min}`:'원수 · 최고 계급';
  for(const [id,size] of [['lobby-badge',48],['clan-badge',32],['chat-badge',24],['result-badge',36]])$(id).innerHTML=badge(r,size);
  for(const id of ['lobby-label','clan-label','chat-label','result-label'])$(id).textContent=`${r.name} · Lv.${level}`;
  $('size-line').innerHTML=[24,32,48,80].map(size=>`<div>${badge(r,size)}<small>${size}px</small></div>`).join('');
}
function choose(code){const r=RANKS.find(r=>r.code===code);if(!r)return;level=r.min;update();}
$('rank-select').addEventListener('change',e=>choose(e.target.value));$('rank-list').addEventListener('click',e=>{const b=e.target.closest('[data-rank]');if(b)choose(b.dataset.rank);});
$('level-input').addEventListener('change',e=>{level=normalizeLevel(e.target.value);update();});
$('display-rank-select').addEventListener('change',e=>choose(e.target.value));
const tabs=[...document.querySelectorAll('[role=tab]')];
function tabTo(tab,focus=false){for(const b of tabs){const active=b===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;$(b.getAttribute('aria-controls')).hidden=!active;}if(focus)tab.focus();}
tabs.forEach((b,index)=>{b.addEventListener('click',()=>tabTo(b));b.addEventListener('keydown',e=>{const key=e.key;if(!['ArrowRight','ArrowLeft','Home','End'].includes(key))return;e.preventDefault();tabTo(tabs[key==='Home'?0:key==='End'?tabs.length-1:(index+(key==='ArrowRight'?1:tabs.length-1))%tabs.length],true);});});
const dialog=$('profile-dialog');let returnFocus=null;
function closeCard(){dialog.close();returnFocus?.focus();}
function openCard(){
  returnFocus=document.activeElement;
  const profile={player:{nickname:'숲의지휘관',clan:null,avatar:null,title:null},ranked:{state:'UNRANKED',tier:null,season:'현재 시즌',rank:null,score:0,wins:0,losses:0,bestRank:null,longestStreak:0,history:[]},trophies:[],clanHistory:[],historyLimit:12};
  $('profile-content').innerHTML=window.PlayerCallingCard.render(profile,{demo:true});
  const identity=dialog.querySelector('.pc-id-content');
  const block=document.createElement('div');block.className='pc-account-rank';block.innerHTML=`${badge(selected,64)}<span><b>${selected.name} · Lv.${level}</b><small>계정 성장 계급</small></span>`;identity.querySelector('h2').after(block);
  dialog.querySelector('.pc-top-caption').textContent='계급 표시 검수 · 예시 계정';
  dialog.querySelector('[data-pc-close]').addEventListener('click',closeCard);
  dialog.querySelectorAll('[data-pc-tab]').forEach(button=>button.addEventListener('click',()=>{
    for(const b of dialog.querySelectorAll('[data-pc-tab]')){const active=b===button;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;dialog.querySelector(`#${b.getAttribute('aria-controls')}`).hidden=!active;}
  }));
  dialog.showModal();dialog.querySelector('[data-pc-close]').focus();
}
for(const id of ['header-profile','nav-card','full-card','lobby-profile','clan-profile','chat-profile','result-profile'])$(id).addEventListener('click',openCard);
dialog.addEventListener('cancel',e=>{e.preventDefault();closeCard();});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeCard();}});
update();
