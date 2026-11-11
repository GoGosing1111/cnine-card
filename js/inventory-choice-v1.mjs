const emperor='EMPEROR_EQUIPMENT_CHOICE_15';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slotNames={TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'듀얼디스크'};
const art=index=>`<span class="choice-part part-${Number(index)}" aria-hidden="true"></span>`;

export async function openInventoryChoice({itemCode,userId,token,apiRequest,host,onClose,refresh}){
  if(!host?.isConnected||host.querySelector('.inventory-choice'))return;
  const account=Number(userId),auth=token();
  if(!account||!auth)throw Error('로그인 후 사용할 수 있습니다.');
  const isBox=itemCode===emperor,key='cnine.choice.'+itemCode+':'+account;
  const dialog=document.createElement('dialog'),controller=new AbortController();
  const title=isBox?'엠퍼러 +15 장비 선택상자':'용병 21레벨 최종 돌파권';
  let state,pending,chosen=null,busy=false;
  const active=()=>dialog.open&&dialog.isConnected&&token()===auth;
  if(!document.getElementById('inventory-choice-styles')){
    const style=document.createElement('link');
    style.id='inventory-choice-styles';style.rel='stylesheet';style.href='/css/inventory-choice-v1.css';document.head.append(style);
  }
  dialog.className='inventory-choice';dialog.setAttribute('aria-label',title);host.append(dialog);
  const cleanup=()=>{controller.abort();dialog.remove();onClose?.();};
  dialog.addEventListener('close',cleanup,{once:true});
  dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-choice-close]'))dialog.close();});
  const shell=content=>{
    dialog.innerHTML=`<section class="choice-surface"><header><h2>${title}</h2><button type="button" data-choice-close aria-label="닫기">×</button></header>${content}</section>`;
  };
  const alertView=message=>shell(`<p role="alert">${escape(message)}</p><button type="button" class="choice-primary" data-choice-close>닫기</button>`);
  const request=async(path,data)=>{
    if(token()!==auth)throw Error('계정이 변경되었습니다. 인벤토리를 다시 열어 주세요.');
    return apiRequest('item-choice/'+itemCode+'/'+path,{method:data?'POST':'GET',
      ...(data?{body:JSON.stringify(data)}:{}),signal:controller.signal},{microcache:false,replaceInflight:true,timeoutMs:20000});
  };
  const remember=value=>{localStorage.setItem(key,JSON.stringify(value));pending=value;};
  const forget=()=>{localStorage.removeItem(key);pending=null;};
  function completed(result){
    if(!active())return;
    if(result.itemCode!==itemCode||result.status!=='COMPLETED'||result.consumed!==1)throw Error('사용 영수증을 다시 확인해 주세요.');
    const reward=result.reward;
    shell(`<section class="choice-result" role="status">${isBox?art(reward.artIndex):'<img alt="" src="/assets/items/mercenary-breakthrough-21-v1.webp">'}
      <h3>${escape(reward.name)}${isBox?' +15 획득':' 21레벨 최종 돌파'}</h3>
      <p>${isBox?'선택한 장비 1개가 장비함에 들어왔습니다.':escape(reward.identityLabel)+' · Lv.'+Number(reward.beforeLevel)+' → Lv.21 · 5·10·15·20레벨 돌파 완료'}</p>
      <button type="button" class="choice-primary" data-choice-close>확인</button></section>`);
    forget();dialog.querySelector('.choice-primary').focus();void refresh(result.replayed).catch(()=>{});
  }
  function render(message=''){
    if(!active())return;
    const choices=state.choices,usable=choices.filter(c=>!c.complete);
    const select=isBox?`<div class="choice-parts" role="group" aria-label="받을 장비">${choices.map(c=>`<button type="button" data-choice-target="${escape(c.code)}" aria-pressed="false">${art(c.artIndex)}<b>${escape(c.name)} +15</b><small>${escape(slotNames[c.slot])}</small></button>`).join('')}</div>`:
      `<label class="choice-mercenary">돌파할 용병<select data-choice-select><option value="">용병 선택</option>${choices.slice().sort((a,b)=>Number(a.complete)-Number(b.complete)||a.name.localeCompare(b.name,'ko')||a.code.localeCompare(b.code)).map(c=>`<option value="${escape(c.code)}" ${c.complete?'disabled':''}>${escape(c.name)} · ${escape(c.identityLabel)} · ${escape(c.code)} · ${c.complete?'최종 돌파 완료':'Lv.'+Number(c.level)}</option>`).join('')}</select></label>`;
    shell(`<div class="choice-item"><img src="/${escape(state.item.image)}" width="76" height="76" alt=""><div><strong>보유 ${state.quantity.toLocaleString()}개</strong><p>${escape(state.item.description)}</p></div></div>
      ${select}<footer><p data-choice-summary aria-live="polite"></p><button class="choice-primary" type="button" data-choice-confirm></button><output aria-live="polite"></output></footer>`);
    const confirm=dialog.querySelector('[data-choice-confirm]'),summary=dialog.querySelector('[data-choice-summary]'),status=dialog.querySelector('output');
    const update=()=>{
      const selected=choices.find(c=>c.code===chosen),locked=busy||!!pending;
      dialog.querySelectorAll('[data-choice-target]').forEach(b=>{b.disabled=locked;b.setAttribute('aria-pressed',String(b.dataset.choiceTarget===chosen));});
      const dropdown=dialog.querySelector('select');if(dropdown){dropdown.disabled=locked||!usable.length;dropdown.value=chosen||'';}
      confirm.disabled=busy||(!pending&&(!selected||selected.complete||!state.enabled||state.quantity<1));
      summary.textContent=pending?'이전 사용 결과를 확인해 주세요.':selected?(isBox?selected.name+' +15 1개':selected.name+' · '+selected.identityLabel+' · Lv.'+selected.level+' → Lv.21'):
        !state.enabled?'현재 사용이 중지되어 있습니다.':!state.quantity?'보유한 아이템이 없습니다.':!usable.length?(isBox?'현재 선택할 장비가 없습니다.':'최종 돌파할 보유 용병이 없습니다.'):(isBox?'받을 장비를 선택하세요.':'영구 보유한 용병을 선택하세요.');
      confirm.textContent=pending?'같은 요청 결과 확인':isBox?'상자 1개 사용하고 받기':'돌파권 1개 사용하기';
    };
    dialog.querySelectorAll('[data-choice-target]').forEach(b=>b.onclick=()=>{chosen=b.dataset.choiceTarget;update();});
    const dropdown=dialog.querySelector('select');if(dropdown)dropdown.onchange=()=>{chosen=dropdown.value;update();};
    confirm.onclick=async()=>{
      if(confirm.disabled||busy)return;
      busy=true;
      try{
        if(!pending){
          const target=choices.find(c=>c.code===chosen);
          remember({requestId:crypto.randomUUID(),targetCode:target.code,...(isBox?{}:{revision:target.revision})});
        }
        update();status.textContent='사용 결과를 확인하고 있습니다…';
        completed(await request('use',pending));
      }catch(error){
        if(!active())return;
        if(['JOINT_CHOICE_UNAVAILABLE','JOINT_OPERATION_SUPERSEDED','JOINT_REQUEST_CONFLICT','JOINT_CHOICE_PENDING'].includes(error.code)){
          forget();chosen=null;busy=false;
          try{await load(error.message);}catch(loadError){if(active())alertView(loadError.message);}
        }else{busy=false;update();status.textContent=error.message;}
      }
    };
    update();status.textContent=message;
  }
  async function load(message=''){
    state=await request('options');
    if(!active())return;
    if(Number(state.userId)!==account)throw Error('계정이 변경되었습니다. 인벤토리를 다시 열어 주세요.');
    pending=JSON.parse(localStorage.getItem(key)||'null');
    const id=state.pendingRequestId||pending?.requestId;
    if(id){
      try{
        const res=await request('receipt?requestId='+encodeURIComponent(id));
        if(!active())return;
        if(res.status==='COMPLETED'){completed(res);return;}
        const {targetCode,revision}=res.input;
        remember({requestId:id,targetCode,...(isBox?{}:{revision})});chosen=targetCode;
      }catch(error){
        if(error.code==='JOINT_OPERATION_SUPERSEDED')forget();
        else if(error.code!=='JOINT_NOT_FOUND'||pending?.requestId!==id)throw error;
      }
    }
    render(message);
  }
  shell('<p role="status">선택할 대상을 불러오고 있습니다…</p>');dialog.showModal();
  try{await load();}catch(error){if(active())alertView(error.message);}
}
