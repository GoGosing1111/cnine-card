import {POLICY,ROLES,ROLE_BY_ID,quote,eligibility,formatAmount as fmt,escapeHtml as esc} from './model.mjs';
const root='/preview/v35-advancement-fx-20261104/';
const art=id=>root+'painted-v2/native/Texture/'+id+'-3.png';
const asset=value=>'/'+String(value||'').replace(/^\/+/, '');
let windowSerial=0;

/** Isolated, reusable dialog. A host must supply its own authorized transaction
 * adapter. No implicit production endpoint or activation is included. */
export function createAdvancementWindow({adapter,onPreview=async()=>{},onChanged=()=>{},mount=document.body}={}){
 if(!adapter?.read||!adapter?.commit)throw Error('Explicit advancement adapter required');
 const uid='merc-advance-'+ ++windowSerial,dialog=document.createElement('dialog');
 dialog.className='adv-window cn-command-ui';dialog.setAttribute('aria-labelledby',uid+'-title');mount.append(dialog);
 let snapshot=null,code=null,selected='vanguard',filter='전체',view='select',busy=false,error='',notice='',pending=null,opener=null,destroyed=false,loadEpoch=0;
 const $=selector=>dialog.querySelector(selector);
 function current(){return snapshot?.cards.find(c=>c.code===code);}
 function close(){if(busy)return;dialog.close();opener?.focus?.();}
 function render({focus=null}={}){
  if(destroyed)return;
  const previousFocus=document.activeElement?.dataset?.focus,scroll=$('.adv-scroll')?.scrollTop||0;
  const card=current(),q=card?quote(snapshot,code,selected):null,role=ROLE_BY_ID.get(selected),oldRole=ROLE_BY_ID.get(card?.advancement?.id),blocked=busy||!!pending;
  dialog.setAttribute('aria-busy',String(busy));
  dialog.innerHTML=`<div class="adv-frame cn-ui-panel">
   <header class="adv-header"><div><span class="adv-eyebrow">MERCENARY CLASS</span><h1 id="${uid}-title">용병 전직</h1></div><span class="adv-guarantee">확률 없이 · 즉시 전직</span><button type="button" class="cn-ui-button adv-close" data-action="close" data-focus="close" aria-label="전직창 닫기" ${busy?'disabled':''}>닫기 ×</button></header>
   <div class="adv-scroll">
   ${!snapshot?`<p class="adv-empty" role="status">${esc(error||'보유 용병 정보를 불러오고 있습니다…')}</p>${error?'<button type="button" class="cn-ui-button" data-action="reload">다시 불러오기</button>':''}`:!card?'<p class="adv-empty">보유한 용병이 없습니다. 용병을 획득한 뒤 전직할 수 있습니다.</p>':`
    <div class="adv-body">
     <aside class="adv-mercenary cn-ui-panel">
      <label class="adv-mercenary-select">전직할 용병<select data-action="mercenary" data-focus="mercenary" aria-label="전직할 용병" ${blocked?'disabled':''}>${snapshot.cards.map(c=>`<option value="${esc(c.code)}" ${code===c.code?'selected':''}>${esc(c.name)} · ${esc(c.rank)} · Lv.${c.growth.level}</option>`).join('')}</select></label>
      <div class="adv-portrait"><img src="${esc(asset(card.sourceArt))}" alt="${esc(card.name)} 원화"><span class="adv-rank">${esc(card.rank)}${card.edition==='LIMITED'?' · LIMITED':''}</span></div>
      <div class="adv-mercenary-info"><span class="adv-code">${esc(card.code)} · Lv.${card.growth.level}</span><h2>${esc(card.name)}</h2><p>현재 전직 <b>${oldRole?esc(oldRole.name):'미전직'}</b></p></div>
      <div class="adv-conditions"><span class="${POLICY.ranks.includes(card.rank)?'met':'unmet'}">${POLICY.ranks.includes(card.rank)?'✓':'!'} SS급 이상</span><span class="${card.growth.level>=16?'met':'unmet'}">${card.growth.level>=16?'✓':'!'} 용병 16레벨 이상</span></div>
      <p class="adv-retain"><span>무기·포지션 제한 없이 선택</span><span>레벨·돌파·장비 유지</span></p>
     </aside>
     <section class="adv-selection" aria-label="전직 선택">
     ${view==='success'?`<div class="adv-success cn-ui-panel" role="status"><img src="${art(selected)}" alt=""><span>전직 완료</span><h2>${esc(card.name)} · ${esc(role.name)}</h2><p>${esc(role.tagline)}</p><p>다음 전투부터 선택한 특성이 적용됩니다.</p><button type="button" class="cn-ui-button primary" data-action="continue" data-focus="continue">전직 목록 보기</button></div>`:view==='confirm'||pending?`
      <div class="adv-confirm cn-ui-panel"><span class="adv-eyebrow">${pending?'처리 결과 확인':'최종 확인'}</span><h2>${q.change?'전직을 변경합니다':'첫 전직을 시작합니다'}</h2><div class="adv-transition"><span>${oldRole?esc(oldRole.name):'미전직'}</span><b aria-label="에서">→</b><strong>${esc(role.name)}</strong></div><img class="adv-confirm-art" src="${art(selected)}" alt=""><p>${esc(card.name)}의 특성을 <b>${esc(role.name)}</b>으로 선택합니다.</p><p>코인 <strong>10조</strong>와 마스터의 별 <strong>5,000만</strong>을 함께 소모합니다.<br>이후 다른 전직으로 변경할 때도 같은 비용이 필요합니다.</p><small>레벨·돌파·장비는 유지되며 다음 전투부터 적용됩니다.</small></div>`:`
      <div class="adv-selector-heading"><div><h2>나만의 전투 특성</h2><p>16가지 중 하나를 자유롭게 선택하세요.</p></div><span>한 용병당 1개</span></div>
      <div class="adv-filters" role="group" aria-label="특성 분류">${['전체','공격','생존','지원'].map(group=>`<button type="button" class="cn-ui-button ${filter===group?'primary':''}" data-action="filter" data-value="${group}" data-focus="filter-${group}" aria-pressed="${filter===group}" ${blocked?'disabled':''}>${group}${group==='전체'?' 16':''}</button>`).join('')}</div>
      <div class="adv-role-grid" role="group" aria-label="16가지 전직">${ROLES.filter(r=>filter==='전체'||r.group===filter).map(r=>`<button type="button" class="adv-role cn-ui-panel ${selected===r.id?'is-selected':''}" data-action="role" data-value="${r.id}" data-focus="role-${r.id}" aria-pressed="${selected===r.id}" aria-label="${esc(r.name+' · '+r.tagline+(card.advancement?.id===r.id?' · 현재 전직':''))}" ${blocked?'disabled':''}><img src="${art(r.id)}" alt="" loading="eager"><b>${esc(r.name)}</b><small>${esc(r.group)}</small>${card.advancement?.id===r.id?'<span class="adv-current">현재</span>':selected===r.id?'<span class="adv-selected" aria-hidden="true">✓</span>':''}</button>`).join('')}</div>
      <section class="adv-description cn-ui-panel" aria-live="polite"><img src="${art(selected)}" alt=""><div><span>${esc(role.group)} · ${esc(role.trigger)}</span><h3>${esc(role.name)} <small>${esc(role.tagline)}</small></h3><p>${esc(role.description)}</p><button type="button" class="adv-effect-link" data-action="preview" data-focus="preview">전투 이펙트 보기 ↗</button></div></section>
      <p class="adv-balance-note">효과 수치는 업데이트 전 조정될 수 있습니다.</p>`}
     </section>
    </div>`}
   </div>
   ${card?`<footer class="adv-footer">
    <div class="adv-feedback ${error||view!=='success'&&(q.unavailable||q.insufficient)?'is-error':''}" role="status" aria-live="polite">${esc(error||notice||(pending?'같은 요청의 결과를 확인하면 중복 소모 없이 이어집니다.':view==='success'?'전직 정보와 남은 재화를 확인했습니다.':q.unavailable||(q.insufficient?'재화가 부족합니다. 아래 부족량을 확인해 주세요.':'첫 전직 · 변경 모두 동일한 비용이 필요합니다.')))}</div>
    <div class="adv-payment"><div class="adv-costs" aria-label="전직 비용과 보유 재화">${[['coin','코인','10조'],['MASTER_STAR','마스터의 별','5,000만']].map(([key,label,cost])=>`<div class="adv-cost ${view!=='success'&&q.missing[key]>0n?'is-short':''}"><span>${view==='success'?'소모 ':''}${label}</span><strong>${cost}</strong><small>보유 ${fmt(snapshot.wallet[key])}${q.missing[key]>0n&&view!=='success'?` <em>· ${fmt(String(q.missing[key]))} 부족</em>`:''}</small></div>`).join('')}</div>
    <div class="adv-actions">${view==='confirm'&&!pending?`<button type="button" class="cn-ui-button" data-action="back" data-focus="back" ${busy?'disabled':''}>다시 선택</button>`:''}<button type="button" class="cn-ui-button primary adv-submit" data-action="${view==='success'?'close':pending?'recover':view==='confirm'?'commit':'confirm'}" data-focus="submit" ${busy||(!pending&&view!=='success'&&!q.canSubmit)?'disabled':''}>${busy?'처리 중…':view==='success'?'완료':pending?'같은 요청 결과 확인':view==='confirm'?'비용 소모 · 전직 확정':q.unavailable?(card.advancement?.id===selected?'현재 전직':'전직 조건 미충족'):q.insufficient?'재화 부족':q.change?'전직 변경':'첫 전직'}</button></div></div>
   </footer>`:''}
  </div>`;
  if($('.adv-scroll'))$('.adv-scroll').scrollTop=scroll;
  const wanted=focus||previousFocus;if(wanted)dialog.querySelector(`[data-focus="${CSS.escape(wanted)}"]`)?.focus({preventScroll:true});
 }
 async function load(){const epoch=++loadEpoch;busy=true;error='';render();try{const data=await adapter.read();if(destroyed||epoch!==loadEpoch)return;snapshot=data;if(!data.cards.some(c=>c.code===code))code=data.cards[0]?.code||null;}catch(e){if(epoch===loadEpoch)error=e.message||'정보를 불러오지 못했습니다.';}finally{if(!destroyed&&epoch===loadEpoch){busy=false;render();}}}
 async function open(mercenaryCode){if(destroyed)throw Error('Window destroyed');if(dialog.open)return;opener=document.activeElement;if(!pending){code=mercenaryCode||code;view='select';error='';notice='';}render();dialog.showModal();await load();if(!pending){selected=current()?.advancement?.id||'vanguard';filter='전체';render({focus:'role-'+selected});}else render({focus:'submit'});}
 async function submit(){
  if(busy||!snapshot)return;
  if(!pending){const q=quote(snapshot,code,selected);if(!q.canSubmit)return;pending={idempotencyKey:crypto.randomUUID(),mercenaryCode:code,advancementId:selected,expectedRevision:snapshot.revision,expectedPolicyRevision:snapshot.policyRevision};}
  busy=true;error='';notice='';render();
  try{
   const result=await adapter.commit({...pending});if(destroyed)return;
   if(!result?.snapshot||result.requestId!==pending.idempotencyKey)throw Object.assign(Error('요청 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.'),{ambiguous:true});
   snapshot=result.snapshot;pending=null;view='success';notice='';try{onChanged(result);}catch(callbackError){console.warn('Advancement UI change listener failed',callbackError);}
  }catch(e){if(destroyed)return;error=e.message||'결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.';if(e.definitive===true){pending=null;view='select';try{snapshot=await adapter.read();}catch{}}}
  finally{if(!destroyed){busy=false;render({focus:view==='success'?'continue':'submit'});}}
 }
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>opener?.focus?.());
 dialog.addEventListener('change',event=>{if(event.target.dataset.action==='mercenary'&&!busy&&!pending){code=event.target.value;selected=current()?.advancement?.id||'vanguard';view='select';error='';notice='';filter='전체';render({focus:'mercenary'});}});
 dialog.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
  const action=target.dataset.action;
  if(action==='close')return close();if(action==='reload')return load();if(busy)return;
  if(action==='recover')return submit();if(pending)return;
  if(action==='role'){selected=target.dataset.value;error='';notice='';render({focus:'role-'+selected});if(matchMedia('(max-width:720px)').matches)$('.adv-description')?.scrollIntoView({block:'nearest'});}
  if(action==='filter'){filter=target.dataset.value;render({focus:'filter-'+filter});}
  if(action==='back'||action==='continue'){view='select';error='';notice='';render({focus:'role-'+selected});}
  if(action==='confirm'&&quote(snapshot,code,selected).canSubmit){view='confirm';error='';render({focus:'submit'});$('.adv-scroll').scrollTop=0;}
  if(action==='commit')return submit();
  if(action==='preview'){close();try{await onPreview(selected);}catch(e){error=e.message;await open(code);}}
 });
 dialog.addEventListener('keydown',event=>{
  const button=event.target.closest('[data-action="role"]');if(!button||!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  const buttons=[...dialog.querySelectorAll('[data-action="role"]')],index=buttons.indexOf(button);let next=index;
  if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else next=Math.max(0,Math.min(buttons.length-1,index+({ArrowRight:1,ArrowLeft:-1,ArrowDown:4,ArrowUp:-4}[event.key])));
  event.preventDefault();buttons[next]?.focus();
 });
 return {open,close,refresh:load,element:dialog,destroy(){destroyed=true;loadEpoch++;dialog.close();dialog.remove();},audit(){return {open:dialog.open,code,selected,view,busy,pending:pending?{...pending}:null,error,snapshot:structuredClone(snapshot)};}};
}
