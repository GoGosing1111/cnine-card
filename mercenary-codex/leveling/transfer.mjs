import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
import {createLevelClient} from './client.mjs?v=20261025-transfer-v1';
import {transferGroupLabel,applyTransferXp,TRANSFER_ITEM} from '../../shared/mercenary-experience-transfer-v1.mjs';
import {isLevelComplete} from '../../shared/mercenary-level-v1.mjs';
const app=document.querySelector('#transfer-app'),dialog=document.querySelector('#transfer-confirm');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('ko-KR');
let account,client,sourceCode=new URL(location.href).searchParams.get('code')||'',targetCode='',potionId='',busy=false,notice='',error=false;
const selectedPotion=()=>account?.transfer.potions.find(p=>p.id===potionId);
const source=()=>account.cards.find(c=>c.code===sourceCode);
const target=()=>account.cards.find(c=>c.code===targetCode);
const base=card=>({mercenaryCode:card.code,revision:card.growth.revision,policyRevision:account.policy.revision,transferRevision:account.transfer.revision});
function unavailable(card,potion){
 if(!potion)return '물약 선택 필요';if(card.transfer?.used)return '1회 사용 완료';if(card.transfer?.group!==potion.group)return '등급 불일치';if(card.code===potion.sourceCode)return '추출 원본';if(isLevelComplete(card.growth))return '최대 레벨';return '';
}
function reconcile(){
 if(!account.cards.some(c=>c.code===sourceCode))sourceCode=account.cards[0]?.code||'';
 if(!selectedPotion())potionId=account.transfer.potions[0]?.id||'';
 if(!target()||unavailable(target(),selectedPotion()))targetCode=account.cards.find(c=>!unavailable(c,selectedPotion()))?.code||'';
}
function profile(card){return card?`<div class="transfer-profile">${card.sourceArt?`<img src="/${esc(card.sourceArt.replace(/^\//,''))}" alt="${esc(card.name)}">`:''}<div><span>${esc(transferGroupLabel(card.transfer?.group))} · ${esc(card.code)}</span><b>${esc(card.name)}</b><span>Lv.${card.growth.level} · 현재 ${fmt(card.growth.experience)} EXP</span><span>${card.transfer?.used?'물약 1회 사용 완료':'물약 사용 가능 · 1회'}</span></div></div>`:'';}
function render(){
 app.setAttribute('aria-busy',String(busy));
 if(!account){app.innerHTML=`<p class="transfer-notice error" role="alert">${esc(notice||'불러오는 중…')}</p><button class="cn-ui-button" id="reload">다시 불러오기</button>`;document.querySelector('#reload').onclick=()=>void start();return;}
 reconcile();const pending=Boolean(client.pending()),blocked=busy||pending||!account.enabled,potion=selectedPotion(),s=source(),t=target();
 const banked=account.cards.filter(c=>c.transfer?.bankedXp>0);
 app.innerHTML=`<div class="transfer-notice ${error?'error':''}" role="status" aria-live="polite">${esc(notice||(!account.enabled?'현재 용병 성장이 닫혀 있습니다. 보관함은 확인할 수 있습니다.':''))}</div>${pending?`<section class="cn-ui-panel transfer-bank"><p>이전 성장 요청의 결과를 먼저 확인하세요. 새 물약은 소모하지 않습니다.</p><button id="recover" class="cn-ui-button primary" ${busy?'disabled':''}>이전 요청 확인</button></section>`:''}<div class="transfer-grid"><section class="cn-ui-panel transfer-box"><h2>경험치 추출</h2><p>완료한 레벨과 현재 EXP를 합산합니다.<br>실패·소멸한 경험치는 포함하지 않습니다.</p><label class="transfer-field">추출할 용병<select id="source" ${blocked||!account.cards.length?'disabled':''}>${account.cards.map(c=>`<option value="${c.code}" ${c.code===sourceCode?'selected':''}>${esc(c.name)} · ${esc(transferGroupLabel(c.transfer?.group))} · Lv.${c.growth.level}</option>`).join('')}</select></label>${profile(s)}<button id="extract" class="cn-ui-button primary" ${blocked||!s?'disabled':''}>추출량 확인</button><p class="transfer-note">추출 전에 정확한 EXP와 초기화 내용을 확인합니다. 소수점은 버립니다. 보관 중인 경험치도 합산해 50%만 추출합니다.</p></section><section class="cn-ui-panel transfer-box"><h2>물약 보관함 <small>${account.transfer.potions.length}개</small></h2>${potion?`<label class="transfer-field">사용할 물약<select id="potion" ${blocked?'disabled':''}>${account.transfer.potions.map(p=>`<option value="${esc(p.id)}" ${p.id===potionId?'selected':''}>${esc(transferGroupLabel(p.group))} · ${fmt(p.xp)} EXP · ${esc(p.sourceName)}</option>`).join('')}</select></label><div class="transfer-potion"><img src="${TRANSFER_ITEM.image}" alt=""><div><p>${esc(transferGroupLabel(potion.group))} 전용</p><strong class="transfer-amount">${fmt(potion.xp)} EXP</strong><p>${esc(potion.sourceName)}에게서 추출</p></div></div><label class="transfer-field">받을 용병<select id="target" ${blocked?'disabled':''}><option value="" ${!t?'selected':''}>${t?'용병 선택':'사용 가능한 용병이 없습니다'}</option>${account.cards.map(c=>{const reason=unavailable(c,potion);return `<option value="${c.code}" ${c.code===targetCode?'selected':''} ${reason?'disabled':''}>${esc(c.name)} · ${esc(transferGroupLabel(c.transfer?.group))}${reason?' · '+reason:''}</option>`;}).join('')}</select></label>${profile(t)}<button id="infuse" class="cn-ui-button primary" ${blocked||!t?'disabled':''}>물약 사용 확인</button>`:'<p class="transfer-empty">보관 중인 물약이 없습니다.<br>용병의 경험치를 추출하면 여기에 보관됩니다.</p>'}<p class="transfer-note">한 물약은 한 용병에게만 사용합니다. 받는 용병당 최초 1회만 가능합니다.</p></section></div>${banked.length?`<section class="cn-ui-panel transfer-bank"><h2>용병에게 보관된 경험치</h2><ul>${banked.map(c=>`<li>${esc(c.name)} · ${fmt(c.transfer.bankedXp)} EXP · <a href="./?code=${c.code}">돌파하러 가기 ↗</a></li>`).join('')}</ul><p>돌파 성공·실패 후 남은 경험치를 자동 적용합니다. 최대 레벨에 남은 경험치도 보관되며, 추출 시 합산됩니다.</p></section>`:''}`;
 document.querySelector('#source').onchange=e=>{sourceCode=e.target.value;render();};
 document.querySelector('#potion')?.addEventListener('change',e=>{potionId=e.target.value;targetCode='';render();});
 document.querySelector('#target')?.addEventListener('change',e=>{targetCode=e.target.value;render();});
 document.querySelector('#extract').onclick=()=>void previewExtraction();
 document.querySelector('#infuse')?.addEventListener('click',()=>void previewInfusion());
 document.querySelector('#recover')?.addEventListener('click',()=>void mutate(null,null));
}
function confirmAction(title,html,label){
 document.querySelector('#confirm-title').textContent=title;document.querySelector('#confirm-detail').innerHTML=html;document.querySelector('#confirm-label').textContent=label;
 const check=document.querySelector('#confirm-check'),submit=document.querySelector('#confirm-submit');check.checked=false;submit.disabled=true;check.onchange=()=>submit.disabled=!check.checked;
 dialog.returnValue='cancel';dialog.showModal();check.focus();
 return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'&&check.checked),{once:true}));
}
async function previewExtraction(){
 if(busy||client.pending()||!account.enabled||!source())return;
 busy=true;error=false;render();
 try{
  const quote=await jointAccountRequest('mercenaries/v3/leveling/extract-preview',{method:'POST',body:base(source())});
  if(!quote.xp)throw Error('추출할 누적 성장 경험치가 부족합니다. 최소 2 EXP가 필요합니다.');
  const confirmed=await confirmAction(`${quote.name} 경험치 추출`,`<p>누적 성장 경험치 <b>${fmt(quote.totalXp)} EXP</b></p><p>생성 물약: <strong>${esc(transferGroupLabel(quote.group))} · ${fmt(quote.xp)} EXP</strong> 1개</p><p><strong>이 용병의 레벨·현재 경험치·모든 돌파가 초기화됩니다.</strong><br>Lv.1 · EXP 0 · 돌파 0단계<br>성장 능력치도 초기화됩니다. 보유 카드는 유지됩니다.</p>${quote.fallbackLevels?'<p class="transfer-note">과거 영수증이 없는 레벨은 현재 성장 기준표로 계산했습니다.</p>':''}<p class="transfer-note">계정 내 이 용병의 물약 사용 이력은 초기화되지 않습니다.</p>`,'50%만 보관되고 원래 용병의 성장이 초기화되는 것을 확인했습니다.');
  if(confirmed){busy=false;await mutate('extract',{mercenaryCode:quote.mercenaryCode,revision:quote.revision,policyRevision:quote.policyRevision,transferRevision:quote.transferRevision,expectedXp:quote.xp,group:quote.group});return;}
 }catch(e){notice=e.message;error=true;}finally{busy=false;render();}
}
async function previewInfusion(){
 if(busy||client.pending()||!account.enabled||!target()||unavailable(target(),selectedPotion()))return;
 busy=true;error=false;render();
 try{
  const card=target(),potion=selectedPotion(),body={...base(card),potionId:potion.id},plan=applyTransferXp({policy:account.policy,state:card.growth,target:card,xp:potion.xp});
  const confirmed=await confirmAction(`${card.name} 물약 사용`,`<p>${esc(transferGroupLabel(potion.group))} · <strong>${fmt(potion.xp)} EXP</strong> 물약 1개를 사용합니다.</p><p>Lv.${card.growth.level} → <b>Lv.${plan.after.level}</b><br>즉시 적용 ${fmt(plan.appliedXp)} EXP · 보관 ${fmt(plan.bankedXp)} EXP</p><p>남은 경험치는 기존 돌파를 진행할 때 자동 적용됩니다.</p><p><strong>이 용병은 이후 경험치 이전 물약을 다시 사용할 수 없습니다.</strong></p>`,'이 용병의 물약 사용 기회 1회가 소모되는 것을 확인했습니다.');
  if(confirmed){busy=false;await mutate('infuse',body);return;}
 }catch(e){notice=e.message;error=true;}finally{busy=false;render();}
}
async function mutate(action,body){
 if(busy)return;busy=true;error=false;render();
 try{
  const r=await client.run(action,body,{submit:account.enabled});
  if(r?.status!=='COMPLETED'){notice='이전 요청이 아직 처리 중입니다. 다시 확인해 주세요.';return;}
  account=await client.state();client.acknowledge(r.requestId);
  if(r.action==='EXTRACT'){potionId=r.result.potion.id;targetCode='';notice=`${r.name} 초기화 완료 · ${fmt(r.result.xp)} EXP 물약 1개를 보관했습니다.`;}
  else if(r.action==='INFUSE'){notice=`${r.name}에게 물약을 사용했습니다. ${fmt(r.result.appliedXp)} EXP 적용 · ${fmt(r.result.bankedXp)} EXP 보관. 이 용병은 1회 사용 완료입니다.`;}
  else notice='이전 성장 요청이 완료되었습니다. 용병 성장 화면에서 확인할 수 있습니다.';
 }catch(e){notice=e.message;error=true;try{account=await client.state();}catch{}}
 finally{busy=false;render();}
}
async function start(){
 busy=true;try{account=await jointAccountRequest('mercenaries/v3/leveling/state');client=createLevelClient({accountId:account.userId});notice='';error=false;}catch(e){notice=e.message;error=true;}finally{busy=false;render();}
}
void start();
