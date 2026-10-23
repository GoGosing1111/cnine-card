import {PET_PUMPKIN_CHOICE_ITEM as ITEM,PET_PUMPKIN_CHOICES, PET_PUMPKIN_CHOICE_VERSION as VERSION} from '../shared/pet-pumpkin-choice-v1.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const artPath=value=>'/'+String(value||'').replace(/^\//,'');
const sessions=new WeakMap();
const choices=new Map(PET_PUMPKIN_CHOICES.map(p=>[p.code,p]));
const integer=value=>Number.isSafeInteger(value)&&value>=0;

export async function openPetPumpkinChoice({userId,dialog,body,token,refresh,onClose}){
  sessions.get(dialog)?.();
  if(!document.querySelector('[data-pet-pumpkin-choice-style]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/css/pet-pumpkin-choice-v1.css?v=20261023-v1';link.dataset.petPumpkinChoiceStyle='';document.head.append(link);
  }
  const account=String(userId||''),initialToken=String(token()||''),key='cnine.pet-pumpkin-choice.v1:'+account;
  const originalClass=body.className,originalLabel=dialog.getAttribute('aria-label');
  const controller=new AbortController();let active=true,busy=false,target=null,pending=null,state=null;
  const sameAccount=()=>String(token()||'')===initialToken;
  const sessionError=()=>Object.assign(Error('계정이 변경됐습니다. 창을 닫고 현재 계정으로 다시 열어 주세요.'),{code:'PUMPKIN_CHOICE_ACCOUNT_CHANGED'});
  const assertAccount=()=>{if(!sameAccount())throw sessionError();};
  const dispose=()=>{
    if(!active)return;active=false;controller.abort();dialog.removeEventListener('close',dispose);
    if(sessions.get(dialog)===dispose){sessions.delete(dialog);body.className=originalClass;dialog.classList.remove('ppc-dialog');if(originalLabel===null)dialog.removeAttribute('aria-label');else dialog.setAttribute('aria-label',originalLabel);onClose?.();}
  };
  sessions.set(dialog,dispose);dialog.addEventListener('close',dispose,{once:true});
  dialog.classList.add('ppc-dialog');dialog.setAttribute('aria-label','호박펫 선택권');body.className='ppc-content';
  const api=async(path,data)=>{
    assertAccount();
    const response=await fetch('/api/pets/choice/'+path,{method:data?'POST':'GET',cache:'no-store',
      headers:{authorization:'Bearer '+initialToken,'content-type':'application/json'},
      ...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
    const value=await response.json();assertAccount();
    if(!response.ok)throw Object.assign(Error(value.error||'사용 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.'),{status:response.status,code:value.code,retryable:value.retryable});
    return value;
  };
  const loadOptions=async()=>{
    const options=await api('options');
    if(String(options.userId)!==account)throw sessionError();
    if(!integer(options.quantity)||!Array.isArray(options.choices)||typeof options.enabled!=='boolean')throw Error('선택권 정보를 확인하지 못했습니다. 잠시 후 다시 열어 주세요.');
    return {...options,choices:options.choices.filter(p=>choices.has(p.code)&&integer(p.quantity)).map(p=>({...choices.get(p.code),quantity:p.quantity}))};
  };
  const forget=()=>{localStorage.removeItem(key);pending=null;};
  const saved=()=>{
    const raw=localStorage.getItem(key);if(!raw)return null;
    let value;try{value=JSON.parse(raw);}catch{throw Error('이전 사용 기록을 읽지 못했습니다. 새로고침 후 다시 확인해 주세요.');}
    if(!value||typeof value.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(value.requestId)||!choices.has(value.targetCode)||value.version!==VERSION)throw Error('이전 사용 기록을 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요.');
    return {requestId:value.requestId,targetCode:value.targetCode,version:value.version};
  };
  const header=()=>`<header class="ppc-heading"><img src="${esc(artPath(ITEM.image))}" alt="" width="84" height="84"><div><p class="ppc-eyebrow">PUMPKIN PET SELECT</p><h2>호박펫 선택권</h2><p>함께할 호박펫 1마리를 골라 주세요.</p></div></header>`;
  const bindCancel=()=>body.querySelectorAll('[data-pumpkin-cancel]').forEach(button=>button.onclick=()=>dialog.close());
  const showError=error=>{
    if(!active)return;
    body.innerHTML=header()+`<section class="ppc-message"><p role="alert">${esc(error.message)}</p><p>다시 열면 이전 사용 결과를 먼저 확인합니다.</p><button type="button" class="ppc-button ppc-button-secondary" data-pumpkin-cancel>닫기</button></section>`;bindCancel();
  };
  const resultView=async result=>{
    assertAccount();const pet=choices.get(result.reward?.code);
    if(!pet||result.reward.quantity!==1||!integer(result.reward.ownedAfter))throw Error('지급 결과를 확인하지 못했습니다. 창을 다시 열어 결과를 확인해 주세요.');
    forget();await refresh().catch(()=>{});if(!active)return;assertAccount();
    body.innerHTML=header()+`<section class="ppc-result"><p role="status" class="ppc-result-status">선택권 1개 사용 · 펫 지급 완료</p><div class="ppc-result-art"><img src="${esc(artPath(pet.sourceArt))}" alt="${esc(pet.name)} 승인 원화"></div><h3>${esc(pet.name)} 획득</h3><p>1마리가 추가되었습니다. 이번 사용 직후 ${result.reward.ownedAfter.toLocaleString()}마리 보유</p><p class="ppc-detail-note">펫 도감에서 수집 현황을 확인할 수 있습니다.</p><button type="button" class="ppc-button" data-pumpkin-done>확인</button></section>`;
    body.querySelector('[data-pumpkin-done]').onclick=()=>dialog.close();body.querySelector('[data-pumpkin-done]').focus();
  };
  const render=()=>{
    if(!active)return;
    body.innerHTML=header()+`<p class="ppc-explanation">선택권 <strong>${state.quantity.toLocaleString()}개</strong> 보유<br>호박봉순 · 호박조은 중 1마리 선택</p><div class="ppc-grid" role="group" aria-label="받을 호박펫 선택">${state.choices.map(p=>`<button type="button" class="ppc-target" data-pumpkin-choice="${esc(p.code)}" aria-pressed="${p.code===target}" ${pending?'disabled':''}><span class="ppc-pet-art"><img src="${esc(artPath(p.sourceArt))}" alt="${esc(p.name)} 승인 원화"></span><strong>${esc(p.name)}</strong><span class="ppc-owned">보유 ${p.quantity.toLocaleString()}마리</span><span class="ppc-selected-label" aria-hidden="true">선택됨</span></button>`).join('')||'<p class="ppc-empty">선택 가능한 호박펫을 준비하고 있습니다.</p>'}</div><footer class="ppc-footer"><p data-pumpkin-summary aria-live="polite"></p><div class="ppc-actions"><button type="button" class="ppc-button ppc-button-secondary" data-pumpkin-cancel>취소</button><button type="button" class="ppc-button" data-pumpkin-confirm></button></div><output role="status" aria-live="polite"></output></footer><p class="ppc-detail-note">확인하면 선택권 1개가 사용되고 선택한 펫 1마리를 받습니다.</p>`;
    const confirm=body.querySelector('[data-pumpkin-confirm]'),status=body.querySelector('output'),summary=body.querySelector('[data-pumpkin-summary]');
    const update=()=>{
      const pet=state.choices.find(p=>p.code===target);
      summary.textContent=pending?'이전 사용 결과를 확인해 주세요.':pet?pet.name+' · 1마리 획득':'받을 호박펫을 선택하세요.';
      confirm.textContent=pending?'이전 사용 결과 확인':pet?pet.name+' 받기':'펫을 선택하세요';
      confirm.disabled=busy||(!pending&&(!pet||!state.enabled||state.quantity<1));
      if(!pending&&!state.enabled)status.textContent='현재 선택권 사용이 중지되어 있습니다.';
      else if(!pending&&state.quantity<1)status.textContent='보유한 선택권이 없습니다.';
      body.querySelectorAll('[data-pumpkin-choice]').forEach(button=>{button.disabled=busy||Boolean(pending);button.setAttribute('aria-pressed',String(button.dataset.pumpkinChoice===target));});
    };
    body.querySelectorAll('[data-pumpkin-choice]').forEach(button=>button.onclick=()=>{
      if(busy||pending)return;try{assertAccount();target=button.dataset.pumpkinChoice;update();}catch(error){showError(error);}
    });
    confirm.onclick=async()=>{
      if(busy||(!pending&&!target))return;
      try{assertAccount();}catch(error){showError(error);return;}
      busy=true;update();status.textContent='펫 지급을 확인하고 있습니다…';
      try{
        const request=pending||{requestId:crypto.randomUUID(),targetCode:target,version:VERSION};
        // Save before sending so a lost response can never create a second spend.
        localStorage.setItem(key,JSON.stringify(request));pending=request;
        await resultView(await api('use',request));
      }catch(error){
        if(!active)return;
        if(error.code==='PUMPKIN_CHOICE_ACCOUNT_CHANGED'){showError(error);return;}
        const terminal=error.code==='JOINT_OPERATION_SUPERSEDED'||String(error.code||'').startsWith('PET_CHOICE_')&&error.code!=='PET_CHOICE_PENDING'&&error.status<500&&error.retryable!==true;
        if(terminal){
          forget();target=null;
          try{state=await loadOptions();if(!active)return;busy=false;render();body.querySelector('output').textContent=error.message;}
          catch(refreshError){showError(refreshError);}
          return;
        }
        status.textContent=error.message;
      }finally{
        busy=false;
        if(active&&body.contains(confirm)){update();if(pending){status.textContent=status.textContent||'같은 요청으로 사용 결과를 다시 확인해 주세요.';confirm.textContent='같은 요청 결과 다시 확인';}}
      }
    };bindCancel();update();
  };
  body.innerHTML=header()+`<section class="ppc-message"><p role="status">호박펫과 보유 수량을 확인하고 있습니다…</p><button type="button" class="ppc-button ppc-button-secondary" data-pumpkin-cancel>취소</button></section>`;bindCancel();if(!dialog.open)dialog.showModal();
  try{
    if(!/^\d+$/.test(account)||Number(account)<1||!initialToken)throw Error('로그인 후 선택권을 사용할 수 있습니다.');
    state=await loadOptions();if(!active)return;
    pending=saved();const id=pending?.requestId||state.pendingRequestId;
    if(id){
      try{
        const receipt=await api('receipt?requestId='+encodeURIComponent(id));if(!active)return;
        if(receipt.status==='COMPLETED'){await resultView(receipt);return;}
        const input=receipt.input;
        if(!input||!choices.has(input.targetCode)||input.version!==VERSION)throw Error('이전 사용 내용을 확인하지 못했습니다. 다시 열어 주세요.');
        pending={requestId:id,targetCode:input.targetCode,version:input.version};localStorage.setItem(key,JSON.stringify(pending));
      }catch(error){
        if(error.code==='JOINT_NOT_FOUND'&&pending){/* Request was saved before it reached the server. */}
        else if(error.code==='JOINT_OPERATION_SUPERSEDED')forget();
        else throw error;
      }
    }
    if(!active)return;assertAccount();target=pending?.targetCode||null;render();
  }catch(error){showError(error);}
}
