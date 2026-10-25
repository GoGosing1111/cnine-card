import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
import {createLevelClient} from './client.mjs?v=20261025-item-transfer-v2';
import {transferGroupLabel,TRANSFER_ITEM} from '../../shared/mercenary-experience-transfer-v1.mjs?v=20261025-item-transfer-v2';
import {isLevelComplete} from '../../shared/mercenary-level-v1.mjs';
const app=document.querySelector('#transfer-app'),dialog=document.querySelector('#transfer-confirm');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=n=>Number(n||0).toLocaleString('ko-KR');
let account,client,sourceCode=new URL(location.href).searchParams.get('code')||'',targetCode='',busy=false,notice='',error=false;
const source=()=>account?.cards.find(c=>c.code===sourceCode),target=()=>account?.cards.find(c=>c.code===targetCode);
function unavailable(card){if(!source())return '보낼 용병 선택 필요';if(card.code===sourceCode)return '보내는 용병';if(card.transfer?.used)return '1회 사용 완료';if(card.transfer?.group!==source().transfer?.group)return '등급 불일치';if(isLevelComplete(card.growth))return '최대 레벨';return '';}
function profile(c){return c?`<div class="transfer-profile">${c.sourceArt?`<img src="/${esc(c.sourceArt.replace(/^\//,''))}" alt="${esc(c.name)}">`:''}<div><span>${esc(transferGroupLabel(c.transfer?.group))} · ${esc(c.code)}</span><b>${esc(c.name)}</b><span>Lv.${c.growth.level} · 현재 ${fmt(c.growth.experience)} EXP</span><span>${c.transfer?.used?'물약 받기 1회 사용 완료':'물약 받기 가능 · 1회'}</span></div></div>`:'';}
function render(){
 app.setAttribute('aria-busy',String(busy));
 if(!account){app.innerHTML=`<p class="transfer-notice error" role="alert">${esc(notice||'불러오는 중…')}</p><button class="cn-ui-button" id="reload">다시 불러오기</button>`;document.querySelector('#reload').onclick=()=>void start();return;}
 if(!source())sourceCode=account.cards[0]?.code||'';
 if(!target()||unavailable(target()))targetCode=account.cards.find(c=>!unavailable(c))?.code||'';
 const pending=Boolean(client.pending()),quantity=account.transfer.quantity||0,blocked=busy||pending||!account.enabled||!account.transfer.enabled||quantity<1;
 app.innerHTML=`<div class="transfer-notice ${error?'error':''}" role="status" aria-live="polite">${esc(notice)}</div>${pending?`<section class="cn-ui-panel transfer-bank"><p>이전 요청의 결과를 먼저 확인하세요.</p><button id="recover" class="cn-ui-button primary" ${busy?'disabled':''}>이전 요청 확인</button></section>`:''}<section class="cn-ui-panel transfer-bank"><div class="transfer-potion"><img src="${TRANSFER_ITEM.image}" alt=""><div><h2>보유 물약 <strong id="item-count">${fmt(quantity)}개</strong></h2><p>별도로 획득한 물약 1개를 소모합니다.</p></div></div>${quantity<1?'<p id="item-required">사용할 물약이 없습니다. 물약 아이템을 먼저 획득해 주세요.</p>':''}${!account.enabled||!account.transfer.enabled?'<p>현재 경험치 이전을 이용할 수 없습니다.</p>':''}</section><div class="transfer-grid"><section class="cn-ui-panel transfer-box"><h2>경험치를 보낼 용병</h2><label class="transfer-field">보낼 용병<select id="source" ${blocked?'disabled':''}>${account.cards.map(c=>`<option value="${c.code}" ${c.code===sourceCode?'selected':''}>${esc(c.name)} · ${esc(transferGroupLabel(c.transfer?.group))} · Lv.${c.growth.level}</option>`).join('')}</select></label>${profile(source())}<p>누적 경험치의 50%를 이전하고<br>Lv.1 · EXP 0 · 돌파 0단계로 초기화합니다.</p></section><section class="cn-ui-panel transfer-box"><h2>경험치를 받을 용병</h2><label class="transfer-field">받을 용병<select id="target" ${blocked?'disabled':''}><option value="">용병 선택</option>${account.cards.map(c=>{const reason=unavailable(c);return `<option value="${c.code}" ${c.code===targetCode?'selected':''} ${reason?'disabled':''}>${esc(c.name)} · ${esc(transferGroupLabel(c.transfer?.group))}${reason?' · '+reason:''}</option>`;}).join('')}</select></label>${profile(target())}<button id="transfer" class="cn-ui-button primary" ${blocked||!target()?'disabled':''}>물약 1개 사용 · 이전량 확인</button><p class="transfer-note">확인 후 물약 소모와 두 용병의 경험치 이전이 함께 처리됩니다. 받는 용병당 최초 1회만 가능합니다.</p></section></div>${account.cards.some(c=>c.transfer?.bankedXp>0)?`<section class="cn-ui-panel transfer-bank"><h2>돌파 후 적용할 경험치</h2><ul>${account.cards.filter(c=>c.transfer?.bankedXp>0).map(c=>`<li>${esc(c.name)} · ${fmt(c.transfer.bankedXp)} EXP · <a href="./?code=${c.code}">돌파하러 가기 ↗</a></li>`).join('')}</ul></section>`:''}`;
 document.querySelector('#source').onchange=e=>{sourceCode=e.target.value;targetCode='';render();};document.querySelector('#target').onchange=e=>{targetCode=e.target.value;render();};
 document.querySelector('#transfer').onclick=()=>void preview();document.querySelector('#recover')?.addEventListener('click',()=>void mutate(null));
}
function confirmAction(quote){
 const r=quote.result;document.querySelector('#confirm-title').textContent='물약 1개 사용 · 경험치 이전';
 document.querySelector('#confirm-detail').innerHTML=`<p><strong>${esc(TRANSFER_ITEM.name)} 1개를 소모합니다.</strong></p><p>${esc(r.source.name)}: Lv.${r.source.before.level} → <b>Lv.1 · EXP 0 · 돌파 초기화</b></p><p>누적 ${fmt(r.totalXp)} EXP의 50%인 <strong>${fmt(r.xp)} EXP</strong>를 이전합니다.</p><p>${esc(quote.name)}: Lv.${r.before.level} → <b>Lv.${r.after.level}</b><br>즉시 적용 ${fmt(r.appliedXp)} EXP · 돌파 후 적용 ${fmt(r.bankedXp)} EXP</p><p>받는 용병의 물약 사용 기회 1회가 소모됩니다. 보유 용병 카드는 유지됩니다.</p>${r.fallbackLevels?'<p class="transfer-note">과거 영수증이 없는 레벨은 현재 성장 기준표로 계산했습니다.</p>':''}`;
 document.querySelector('#confirm-label').textContent='물약 1개 소모와 보내는 용병의 초기화, 받는 용병의 1회 사용을 확인했습니다.';
 const check=document.querySelector('#confirm-check'),submit=document.querySelector('#confirm-submit');check.checked=false;submit.disabled=true;check.onchange=()=>submit.disabled=!check.checked;dialog.returnValue='cancel';dialog.showModal();check.focus();
 return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'&&check.checked),{once:true}));
}
async function preview(){
 if(busy||client.pending()||!target()||account.transfer.quantity<1)return;busy=true;error=false;render();
 try{
  const s=source(),t=target(),body={mercenaryCode:t.code,revision:t.growth.revision,sourceCode:s.code,sourceRevision:s.growth.revision,policyRevision:account.policy.revision,transferRevision:account.transfer.revision};
  const quote=await jointAccountRequest('mercenaries/v3/leveling/transfer-preview',{method:'POST',body});
  if(await confirmAction(quote)){busy=false;await mutate({...body,expectedXp:quote.expectedXp});}
 }catch(e){notice=e.message;error=true;}finally{busy=false;render();}
}
async function mutate(body){
 if(busy)return;busy=true;error=false;render();
 try{const r=await client.run(body?'transfer':null,body,{submit:account.enabled&&account.transfer.enabled});if(r?.status!=='COMPLETED'){notice='이전 요청이 아직 처리 중입니다. 다시 확인해 주세요.';return;}
  account=await client.state();client.acknowledge(r.requestId);notice=r.action==='TRANSFER'?`물약 1개 사용 완료 · ${r.result.source.name} → ${r.name} · ${fmt(r.result.xp)} EXP 이전`:'이전 요청 처리를 확인했습니다.';
 }catch(e){notice=e.message;error=true;try{account=await client.state();}catch{}}finally{busy=false;render();}
}
async function start(){busy=true;try{account=await jointAccountRequest('mercenaries/v3/leveling/state');client=createLevelClient({accountId:account.userId});notice='';error=false;}catch(e){notice=e.message;error=true;}finally{busy=false;render();}}
void start();
