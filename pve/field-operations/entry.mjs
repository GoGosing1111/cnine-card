import {rewardText} from '../../shared/field-operation-battle-plan.mjs';

const content={
  yard:{name:'폐차장',mission:'아틀라스 부품 회수',description:'극성 회수기를 돌파하고 유압거신 아틀라스를 격파하세요. 오른팔을 분리하면 유압 프레임을 전량 회수합니다.'},
  escort:{name:'호송작전',mission:'장갑 수송차 호위',description:'차체와 화물을 지키면서 습격 지휘관을 격파하세요. 방어형은 차량 피해를, 속도형은 화물 손실을 줄입니다.'}
};
const active=new WeakMap(),resetTimers=new Map(),rootName='/pve/field-operations/';
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node};
const transient=error=>!error.status||error.status>=500||error.status===429||error.retryable||error.code==='JOINT_LOCK_BUSY';
const keyFor=(account,mode)=>'rc:field-operation:v3:'+account+':'+mode;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function renderOperationEntry(root,{mode,state,api,refresh}) {
  if(!root.isConnected||!state?.accountId)return;
  const prior=active.get(root);
  if(prior?.busy&&prior.account===state.accountId&&prior.mode===mode)return;
  if(!document.querySelector('link[data-field-entry]')){
    const css=el('link');css.rel='stylesheet';css.href=rootName+'entry.css';css.dataset.fieldEntry='';document.head.append(css);
  }
  const ctx={mode,account:state.accountId,busy:false};active.set(root,ctx);
  const yard=mode==='yard',c=content[mode],key=keyFor(state.accountId,mode);
  const path=(yard?'scrapyard':'escort')+'/v3/operation';
  const daily=state.daily;
  const entries=Math.max(0,daily.runLimit-daily.startedCount),claims=Math.max(0,daily.rewardLimit-daily.rewardCount);
  const allowed=(!yard||state.access.allowed)&&entries>0&&claims>0;
  clearTimeout(resetTimers.get(mode));
  const untilReset=Date.parse(daily.resetsAt)-Date.parse(state.serverNow);
  if(Number.isFinite(untilReset))resetTimers.set(mode,setTimeout(()=>{
    resetTimers.delete(mode);
    if(root.isConnected&&!root.closest('[hidden]')&&!ctx.busy&&active.get(root)===ctx)void refresh().catch(()=>{});
  },Math.max(0,untilReset)+200));
  const pending=()=>{try{return JSON.parse(localStorage.getItem(key))}catch{return null}};
  const forget=id=>{if(pending()?.requestId===id)localStorage.removeItem(key)};
  const page=el('section',null,'field-operation-entry '+mode),header=el('header'),title=el('div'),entriesBox=el('div',null,'field-operation-tiers');
  title.append(el('small',c.mission),el('h2',c.name),el('p',c.description));header.append(title);
  header.append(el('strong','오늘 도전 '+entries+' / '+daily.runLimit+'회 · 보상 수령 '+claims+' / '+daily.rewardLimit+'회 남음'));
  const msg=el('p',null,'field-operation-status');msg.setAttribute('role','status');msg.hidden=true;
  const note=el('p','도전·보상 횟수는 매일 오전 0시(한국 시간)에 갱신됩니다. 편성 참고치는 같은 난이도를 8번 플레이해 6승 이상 기록한 덱 중 가장 낮은 전투력입니다.','field-operation-note');
  page.append(header,entriesBox,note,msg);root.replaceChildren(page);
  const notify=text=>{msg.textContent=text;msg.hidden=false};
  async function open(tier,record) {
    if(ctx.busy||active.get(root)!==ctx)return;
    ctx.busy=true;entriesBox.querySelectorAll('button').forEach(b=>b.disabled=true);
    const saved=record||{tier,requestId:crypto.randomUUID()};
    try {localStorage.setItem(key,JSON.stringify(saved));}catch{
      ctx.busy=false;notify('작전 기록을 저장할 수 없습니다. 브라우저 저장 공간을 확인한 후 다시 입장하세요.');
      entriesBox.querySelectorAll('button').forEach(b=>b.disabled=!allowed);return;
    }
    notify(record?'저장된 작전 결과를 확인하고 있습니다.':'출전 편성을 불러오고 있습니다.');
    const request=async()=>{
      if(record){
        try{return await api(path+'?requestId='+encodeURIComponent(saved.requestId));}
        catch(e){if(e.status!==404)throw e;}
      }
      return api(path,{method:'POST',body:JSON.stringify(saved)});
    };
    let result;
    try{
      for(let retry=0;;retry++){
        try{result=await request();break;}catch(error){if(retry>=2||!transient(error))throw error;await wait(700*(retry+1));}
      }
    }catch(error){
      ctx.busy=false;
      if(!transient(error)&&error.status!==401)forget(saved.requestId);
      notify(error.message||'작전 기록을 확인하지 못했습니다.');
      if(pending()){const retry=el('button','같은 작전 확인');retry.type='button';retry.onclick=()=>open(tier,saved);msg.append(' ',retry);}
      else entriesBox.querySelectorAll('button').forEach(b=>b.disabled=!allowed);
      return;
    }
    if(!root.isConnected||active.get(root)!==ctx||root.closest('[hidden]')){ctx.busy=false;return;}
    const bridge=window.CNineEscortBridge,player=bridge?.loadUser?.();
    if(result.balances&&Number(player?.serverUserId??player?.id)===state.accountId){
      bridge.saveUser({...player,coin:result.balances.coin,masterStars:result.balances.masterStars});
    }
    const frame=el('iframe');frame.title=c.name+' V3 자동전투';frame.className='field-operation-frame';frame.allow='fullscreen';frame.allowFullscreen=true;
    const lastFocus=document.activeElement;
    const close=()=>{
      if(!frame.isConnected)return;
      watch.disconnect();frame.remove();ctx.busy=false;forget(saved.requestId);
      lastFocus?.focus?.();refresh();
    };
    frame.fieldOperation={mode,result,close};
    const watch=new MutationObserver(()=>{
      if(!root.isConnected||root.closest('[hidden]')||!frame.isConnected){watch.disconnect();frame.remove();ctx.busy=false;}
    });
    watch.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    frame.src=rootName+'index.html';document.body.append(frame);frame.focus();msg.hidden=true;
  }
  for(const t of state.fieldOperations){
    const button=el('button');button.type='button';button.disabled=!allowed;
    const name=el('b',t.name),details=el('span');
    details.append(el('small','편성 참고 '+Number(t.observedPower).toLocaleString('ko-KR')),el('strong',rewardText(t)));
    button.append(name,details,el('i','입장 →'));button.setAttribute('aria-label',c.name+' '+t.name+' 입장');
    button.onclick=()=>open(t.id,pending());entriesBox.append(button);
  }
  const record=pending();if(record&&state.fieldOperations.some(t=>t.id===record.tier))void open(record.tier,record);
}
