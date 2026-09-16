import {RANKS,rankForLevel,percent} from '../shared/account-ranks-v1.mjs';
import {jointAccountRequest as request} from './joint-account-transport.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const art=(r,size=96)=>`/assets/ui/account-ranks-v1/${r.code.toLowerCase()}-${size}.webp`;
const fallbackBridge={loadUser:()=>{try{return JSON.parse(localStorage.getItem('cnine_card_user_v10')||'null');}catch{return null;}},saveUser:user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));dispatchEvent(new Event('cnine:player-updated'));}};
const bridge=()=>window.AccountRankBridge||fallbackBridge;
if(![...document.querySelectorAll('link[rel=stylesheet]')].some(l=>l.href.includes('/css/account-rank-v1.css'))){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/account-rank-v1.css?v=2122';document.head.append(link);}
let me=null,accountId=0,flight=null,lastRead=0,dialog=null,selected=null,presets=[],busy=false,returnFocus=null;
function current(){const user=bridge()?.loadUser();if(Number(user?.serverUserId)!==accountId){accountId=Number(user?.serverUserId)||0;me=null;lastRead=0;}return user?.accountRank||me;}
function badge(r){return r?`<img src="${art(r)}" alt="${esc(r.name)} 계급장" width="36" height="36"><span><b>Lv.${Number(r.level)} · ${esc(r.name)}</b><small>계급·혜택</small></span>`:'';}
function identityHtml(id){const r=current();return Number(id)===accountId&&r?`<span class="account-rank-inline" title="Lv.${Number(r.level)} ${esc(r.name)}"><img src="${art(r)}" alt="${esc(r.name)}" width="28" height="28"></span>`:'';}
async function refresh(){
  if(flight)return flight;if(!bridge()?.loadUser()?.serverUserId)return;
  const uid=Number(bridge().loadUser().serverUserId);lastRead=Date.now();
  flight=request('account-rank/status').then(data=>{
    const user=bridge()?.loadUser();if(Number(user?.serverUserId)!==uid)return;
    accountId=uid;me=data.accountRank;
    if(JSON.stringify(user.accountRank)!==JSON.stringify(me))bridge().saveUser({...user,accountRank:me});
    mount();
  }).catch(()=>{}).finally(()=>{flight=null;});return flight;
}
function mount(){
  const r=current();
  for(const host of document.querySelectorAll('.login-summary-row,.adventure-player-identity,.adventure-lobby-player')){
    if(!r)continue;
    let button=host.querySelector('[data-account-rank-open]');
    if(!button){button=document.createElement('button');button.type='button';button.className='account-rank-open';button.dataset.accountRankOpen='';button.addEventListener('click',()=>open());host.append(button);}
    const signature=`${accountId}:${r.level}:${r.code}`;if(button.dataset.rank!==signature){button.dataset.rank=signature;button.innerHTML=badge(r);}
  }
  const deck=document.getElementById('battleDeck');
  for(const owner of document.querySelectorAll('[data-v3-roster-side="A"] [data-v3-roster-owner]')){
    if(!r)continue;
    let mark=owner.querySelector('.account-rank-inline');
    if(!mark){owner.insertAdjacentHTML('afterbegin',identityHtml(accountId));mark=owner.querySelector('.account-rank-inline');}
    if(mark&&mark.dataset.rank!==String(r.level)){mark.dataset.rank=String(r.level);mark.title=`Lv.${r.level} ${r.name}`;const img=mark.querySelector('img');img.src=art(r);img.alt=`${r.name} 계급장`;}
  }
  if(deck&&!deck.parentElement.querySelector('[data-account-rank-presets]')){
    const button=document.createElement('button');button.type='button';button.className='account-rank-preset-entry';button.dataset.accountRankPresets='';button.textContent='내 편성 보관함';button.addEventListener('click',()=>open(true));deck.after(button);
  }
  if(accountId&&!flight&&Date.now()-lastRead>30000)void refresh();
}
function detail(){
  const r=selected||rankForLevel(current()?.level||1),own=current(),isMine=r.code===own?.code;
  return `<div class="ar-stage" data-tone="${r.tone}"><span class="ar-stage-label">${esc(r.group)} 계급장</span><img src="${art(r,384)}" alt="${esc(r.name)} 계급장" width="280" height="280"><div class="ar-stage-title"><span>${isMine?'현재 계급':r.min>(own?.level||1)?'미달성 계급':'달성 계급'}</span><h3>${esc(r.name)}</h3><b>Lv.${r.min}${r.max!==r.min?`–${r.max}`:''}</b></div></div><section class="ar-effects"><h3>계급 혜택</h3><dl><div><dt>개인 전투 공격력</dt><dd>+${percent(r.attackBp)}</dd></div><div><dt>개인 전투 최대 HP</dt><dd>+${percent(r.hpBp)}</dd></div><div><dt>개인 PVE 기본 코인</dt><dd>+${percent(r.coinBp)}</dd></div><div><dt>PVE 편성 보관함</dt><dd>${r.presetSlots}칸</dd></div></dl><p>공격력·HP: 토벌·아포칼립스·호송·폐차장·카우방<br>코인: 위 콘텐츠와 방치형 원정·차원의 균열<br>PVP·클랜전·영토전·공동 레이드·봉인전·공성·탑에는 전투 버프가 적용되지 않습니다.</p><small>표시된 수치는 해당 계급의 최종 혜택입니다.</small></section>`;
}
function presetMarkup(){
  const slots=current()?.presetSlots||1;
  return `<section class="ar-presets" id="ar-presets"><div><h3>내 편성 보관함 <em>${slots} / 5</em></h3><p>현재 저장된 PVE 일반 카드 5장을 보관합니다.</p></div>${Array.from({length:5},(_,i)=>{
    const slot=i+1,p=presets.find(x=>x.slot===slot),locked=slot>slots;
    return `<div class="ar-preset-row"><strong>${String(slot).padStart(2,'0')}</strong><span><b>${locked?'계급 달성 시 개방':esc(p?.name||'빈 편성')}</b><small>${locked?`${RANKS.find(r=>r.presetSlots>=slot).name}부터 사용`:p?'일반 카드 5장 저장됨':'PVE 덱에서 편성을 먼저 저장하세요'}</small></span><button type="button" data-save="${slot}" ${locked?'disabled':''}>${p?'덮어쓰기':'보관'}</button><button type="button" data-apply="${slot}" ${locked||!p?'disabled':''}>적용</button></div>`;
  }).join('')}</section>`;
}
function render(){
  if(!dialog)return;const r=current();selected=selected||rankForLevel(r?.level||1);
  dialog.innerHTML=`<header class="ar-head"><div><small>숲켓몬 계급</small><h2 id="ar-title">계급과 혜택</h2></div><div class="ar-current">${r?badge(r):''}</div><button type="button" data-close aria-label="계급 창 닫기">×</button></header><div class="ar-body"><nav class="ar-list" aria-label="전체 계급">${RANKS.map(x=>`<button type="button" data-rank="${x.code}" aria-pressed="${x.code===selected.code}"><img src="${art(x)}" alt="" width="40" height="40" loading="lazy"><span><b>${esc(x.name)}</b><small>Lv.${x.min}${x.max!==x.min?`–${x.max}`:''}</small></span>${r?.code===x.code?'<em>현재</em>':''}</button>`).join('')}</nav><main class="ar-main"><div class="ar-detail">${detail()}</div>${presetMarkup()}</main></div><footer class="ar-footer" role="status" aria-live="polite">${r?`내 계급 · Lv.${Number(r.level)} ${esc(r.name)}`:'계급 정보를 불러오는 중입니다.'}</footer>`;
}
async function open(showPresets=false){
  if(dialog)return;returnFocus=document.activeElement;
  dialog=document.createElement('dialog');dialog.className='account-rank-dialog';dialog.setAttribute('aria-labelledby','ar-title');document.body.append(dialog);
  selected=rankForLevel(current()?.level||1);render();dialog.showModal();
  dialog.addEventListener('close',()=>{dialog.remove();dialog=null;returnFocus?.focus();});
  dialog.addEventListener('click',async e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-close')){dialog.close();return;}
    if(button.dataset.rank){selected=RANKS.find(r=>r.code===button.dataset.rank);dialog.querySelectorAll('[data-rank]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));dialog.querySelector('.ar-detail').innerHTML=detail();return;}
    if(busy)return;
    const save=button.dataset.save,apply=button.dataset.apply;if(!save&&!apply)return;
    busy=true;button.disabled=true;const footer=dialog.querySelector('.ar-footer');footer.textContent='편성을 저장하는 중입니다.';
    try{
      await request(apply?'account-rank/presets/apply':'account-rank/presets',{method:'POST',body:{slot:Number(save||apply)}});
      const data=await request('account-rank/presets');presets=data.presets;
      if(!dialog)return;dialog.querySelector('.ar-presets').outerHTML=presetMarkup();footer.textContent=apply?'PVE 편성을 적용했습니다.':'현재 PVE 편성을 보관했습니다.';
      if(apply&&document.getElementById('battleDeck'))await bridge()?.loadBattleView?.();
    }catch(error){if(dialog)footer.textContent=error.message;}finally{busy=false;if(button.isConnected)button.disabled=false;}
  });
  const opened=dialog,uid=Number(bridge()?.loadUser()?.serverUserId);
  try{
    const data=await request('account-rank/status'),user=bridge()?.loadUser();if(dialog!==opened||Number(user?.serverUserId)!==uid)return;me=data.accountRank;
    if(user)bridge().saveUser({...user,accountRank:me});
    presets=(await request('account-rank/presets')).presets;
    if(dialog!==opened)return;selected=rankForLevel(me.level);render();if(showPresets)dialog.querySelector('.ar-presets').scrollIntoView({block:'start'});
  }catch(error){if(dialog)dialog.querySelector('.ar-footer').textContent=error.message;}
}
window.AccountRank=Object.freeze({open,identityHtml,refresh});
let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;mount();});});
observer.observe(document.body,{subtree:true,childList:true});mount();
addEventListener('cnine:player-updated',mount);addEventListener('focus',()=>{if(Date.now()-lastRead>30000)void refresh();});
addEventListener('pagehide',()=>observer.disconnect());
addEventListener('pageshow',()=>{observer.observe(document.body,{subtree:true,childList:true});mount();});
