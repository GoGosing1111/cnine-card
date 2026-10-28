import {ICON_ENHANCEMENT_POLICY as POLICY,iconEnhancementSteps,iconEnhancementPower} from '../shared/icon-enhancement-v1.mjs';
import {formatIconAmount} from '../shared/icon-fusion-policy-v1.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=v=>v==null?'미설정':BigInt(v).toLocaleString('ko-KR');
const materialAmount=v=>v==null?'미설정':formatIconAmount(v);
export function ensureIconEnhancementCss(){
  if(document.querySelector('[data-icon-enhancement-css]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/css/icon-enhancement-v1.css?v=20261024-v2';link.dataset.iconEnhancementCss='';document.head.append(link);
}
export function iconEnhancementTable(basePower=180000){return `<details class="ie-levels"><summary>단계별 전투력 보기</summary><p class="ie-note">매 단계 기본 전투력 +20% · 최대 +10에서 3배<br>공격·체력·방어에 적용하며 행동 속도·스킬 횟수는 유지됩니다.</p><table><thead><tr><th>단계</th><th>전투력</th><th>누적 상승</th><th>성공률</th></tr></thead><tbody>${iconEnhancementSteps(basePower).map(s=>`<tr><th>+${s.level}</th><td>${amount(s.power)}</td><td>+${s.bonusPercent}%</td><td>10%</td></tr>`).join('')}</tbody></table></details>`;}
export function mountIconEnhancement(root,{cardId,request=globalThis.apiRequest}={}){
  ensureIconEnhancementCss();
  const user=globalThis.loadUser?.(),account=String(user?.serverUserId??user?.id??''),key=`cnine:icon-enhancement:v1:${account}`;
  let data=null,pending=null,busy=false,disposed=false,result=null,message='강화 정보를 불러오는 중…';
  const alive=()=>!disposed&&root.isConnected;
  const sameAccount=()=>String(globalThis.loadUser?.()?.serverUserId??globalThis.loadUser?.()?.id??'')===account;
  try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{message='저장된 요청을 확인할 수 없습니다.';}
  const persist=body=>{localStorage.setItem(key,JSON.stringify(body));pending=body;};
  const forget=()=>{localStorage.removeItem(key);pending=null;};
  const api=(path,options={})=>request(path,options,{ttl:0,microcache:false,replaceInflight:true,timeoutMs:30000});
  function render(){
    if(!alive())return;
    const level=data?.card.level??Number(user?.breakthroughs?.[cardId]||0),next=data?.next,costsReady=next?.ready;
    const sufficient=costsReady&&BigInt(data.resources.coin)>=BigInt(next.coinCost)&&data.resources.masterStars>=next.masterStarCost;
    const readout=root.closest('.ir-modal')?.querySelector('aside p');
    if(readout)readout.innerHTML=`강화 전투력 · +${level}<b>${amount(iconEnhancementPower(level))}</b>`;
    const blocked=!data?.card.owned?'보유한 아이콘만 강화할 수 있습니다.':level>=10?'최대 +10 강화에 도달했습니다.':!data.enabled||!costsReady?'강화 준비 중 · 운영 설정 후 이용할 수 있습니다.':!sufficient?'마스터의 별 또는 코인이 부족합니다.':'';
    root.innerHTML=`<section class="ie-panel ie-player" aria-label="아이콘 강화">
      <header class="ie-heading"><div><small>ICON ENHANCEMENT</small><h3>아이콘 강화</h3></div><div class="ie-chance"><span>모든 단계 성공률</span><strong>10<small>%</small></strong></div></header>
      <div class="ie-power"><div class="ie-power-value"><span>현재 전투력 · +${level}</span><strong>${amount(iconEnhancementPower(level))}</strong><small>현재 보유 단계</small></div><span class="ie-power-arrow" aria-hidden="true">→</span><div class="ie-power-value is-next"><span>${level<10?`강화 후 전투력 · +${level+1}`:'최대 전투력 · +10'}</span><strong>${amount(iconEnhancementPower(Math.min(level+1,10)))}</strong><small>${level<10?'+36,000 증가':'최대 단계 달성'}</small></div></div>
      <div class="ie-progress"><progress value="${level}" max="10" aria-label="현재 강화 단계 ${level}, 최대 10"></progress><div><span>현재 <b>+${level}강</b></span><span>최대 +10 · <b>전투력 54만</b></span></div></div>
      ${level<10?`<div class="ie-section-heading"><h4>강화 재료</h4><span>1회 시도 기준</span></div><div class="ie-materials"><article class="ie-material"><img src="/assets/ui/icon-fusion-20261004/master-star.webp" alt="" width="48" height="48"><div><span>마스터의 별</span><strong>${materialAmount(next?.masterStarCost)}</strong><small>${data?`보유 ${materialAmount(data.resources.masterStars)}`:'보유량 확인 중'}</small></div></article><article class="ie-material"><img src="/assets/ui/icon-fusion-20261004/coin.webp" alt="" width="48" height="48"><div><span>코인</span><strong>${materialAmount(next?.coinCost)}</strong><small>${data?`보유 ${materialAmount(data.resources.coin)}`:'보유량 확인 중'}</small></div></article></div>`:''}
      <div class="ie-rules"><b>실패해도 강화 단계 유지</b><p>성공·실패 모두 마스터의 별과 코인을 소모합니다.</p><small>카드 소모·하락·파괴 없음 · 확정 성공 천장 없음</small></div>
      ${result?`<p class="ie-result" role="status"><b>${esc(result.success?`강화 성공 · +${result.level}`:`강화 실패 · +${result.level} 유지`)}</b><span>전투력 ${amount(result.power)} · 마스터의 별 ${materialAmount(result.spent.masterStarCost)} / 코인 ${materialAmount(result.spent.coinCost)} 소모</span></p>`:''}
      <p class="ie-status" role="status" ${message||blocked?'':'hidden'}>${esc(message||blocked)}</p><button type="button" class="ie-button" data-ie-attempt ${busy||(!pending&&(!data?.canAttempt||!sufficient))?'disabled':''}>${busy?'결과 확인 중…':pending?'이전 강화 결과 확인':level>=10?'최대 강화 완료':`+${level+1} 강화 시도`}</button>
      <div class="ie-footer">${iconEnhancementTable(data?.policy?.basePower||180000)}<button type="button" class="ie-reload" data-ie-reload ${busy?'disabled':''}>보유 정보 새로고침</button></div></section>`;
    root.querySelector('[data-ie-attempt]').onclick=attempt;
    root.querySelector('[data-ie-reload]').onclick=()=>load();
  }
  async function syncUser(receipt){
    if(!sameAccount())return;
    const local=globalThis.loadUser?.();
    if(local){local.breakthroughs={...local.breakthroughs,[receipt.cardId]:receipt.level};globalThis.saveUser?.(local);}
    globalThis.clearApiCache?.();
    try{const response=await api('me');if(sameAccount()&&String(response.user?.id)===account&&globalThis.apiUserToLocal)globalThis.saveUser?.(globalThis.apiUserToLocal(response.user));}catch{}
  }
  async function load(){
    if(busy||disposed)return;busy=true;render();
    try{
      data=await api(`icons/enhancement?cardId=${encodeURIComponent(cardId)}`);
      if(!sameAccount())throw Error('계정이 변경되었습니다. 카드 상세를 다시 여세요.');
      if(data.pending)persist({...data.pending.input,requestId:data.pending.requestId});
      if(pending){
        try{const found=await api(`icons/enhancement/receipt?requestId=${encodeURIComponent(pending.requestId)}`);if(found.status==='COMPLETED'){result=found;forget();await syncUser(found);data=await api(`icons/enhancement?cardId=${encodeURIComponent(cardId)}`);}}
        catch(error){if(['JOINT_OPERATION_SUPERSEDED'].includes(error.code))forget();else if(error.code!=='JOINT_NOT_FOUND')throw error;}
      }
      message='';
    }catch(error){message=error.message;}finally{busy=false;render();}
  }
  async function attempt(){
    if(busy||!sameAccount())return;
    if(!pending){
      if(!data?.canAttempt)return;
      try{persist({requestId:crypto.randomUUID(),cardId,expectedLevel:data.card.level,expectedRevision:data.revision,policyVersion:POLICY.version});}
      catch{message='요청 기록을 저장할 수 없습니다. 브라우저 저장 공간을 확인하세요.';render();return;}
    }
    busy=true;message='강화 결과를 확인하고 있습니다.';render();
    try{
      const completed=await api('icons/enhancement/attempt',{method:'POST',body:JSON.stringify(pending)});
      if(completed.status!=='COMPLETED')throw Error('강화 결과를 다시 확인하세요.');
      // Clear only this account's durable request, even if the modal was closed.
      result=completed;forget();await syncUser(completed);message='';
    }catch(error){
      if(/ICON_ENHANCEMENT_(INPUT|CARD|MAX|STALE|CLOSED|BALANCE)$|JOINT_OPERATION_SUPERSEDED|JOINT_REQUEST_CONFLICT/.test(error.code||''))forget();
      message=error.message+(pending?' 같은 요청으로 결과를 다시 확인할 수 있습니다.':'');
    }finally{busy=false;if(alive()){try{data=await api(`icons/enhancement?cardId=${encodeURIComponent(cardId)}`);}catch{}render();}}
  }
  render();void load();return {dispose(){disposed=true;root.replaceChildren();}};
}
