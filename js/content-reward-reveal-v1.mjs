import {jointAccountRequest as api} from './joint-account-transport.mjs';
import {rewardRevealContent} from '../shared/reward-reveal-contents-v1.mjs?v=20261029-blackwing-rewards1';
const shown=new Set();let styles=false;
function ensureStyle(){if(styles)return;styles=true;const link=document.createElement('link');link.rel='stylesheet';link.href='/css/content-reward-reveal-v1.css?v=20261029-blackwing-rewards1';document.head.append(link);}
export async function openContentReward(offerId,{signal}={}){
 const {offer}=await api('rewards/reveal/open?offerId='+encodeURIComponent(offerId),{signal,timeoutMs:15000});
 const {showCoreRewardPicker}=await import('./core-raid-reward-picker-v2.mjs?v=20261029-blackwing-rewards1');
 if(signal?.aborted)return null;
 const result=await showCoreRewardPicker({offer,content:offer.content,signal,claim:body=>api('rewards/reveal/claim',{method:'POST',body,signal,timeoutMs:14000})});
 if(result)window.dispatchEvent(new CustomEvent('cnine:reward-reveal-claimed',{detail:{offerId}}));return result;
}
export function mountRewardRevealButton(host,offer,{signal,auto=false}={}){
 if(!host||!offer?.offerId||host.querySelector('[data-reveal-offer="'+offer.offerId+'"]'))return;
 ensureStyle();const box=document.createElement('div'),button=document.createElement('button'),status=document.createElement('p');box.className='content-reward-reveal';box.dataset.revealOffer=offer.offerId;button.type='button';button.textContent='봉인 보상 선택';status.setAttribute('role','status');status.textContent='보관함 3개 중 하나를 열어 전리품을 획득하세요.';box.append(button,status);host.append(box);let busy=false;
 const open=async()=>{if(busy||signal?.aborted||!box.isConnected)return;busy=true;button.disabled=true;status.textContent='보상 봉인을 불러오는 중…';try{const result=await openContentReward(offer.offerId,{signal});if(signal?.aborted)return;button.textContent=result?'획득 보상 다시 보기':'봉인 보상 선택';status.textContent=result?result.choiceReward.name+' × '+Number(result.choiceReward.quantity).toLocaleString('ko-KR')+' 지급 완료':'미수령 봉인은 보관됩니다. 나중에 다시 선택할 수 있습니다.';}catch(error){if(!signal?.aborted)status.textContent=error.message;}finally{busy=false;button.disabled=false;}};
 button.addEventListener('click',()=>void open(),{signal});
 if(auto&&!shown.has(offer.offerId)){shown.add(offer.offerId);void open();}
}
export function mountRewardRevealInbox(host,{signal}={}){
 if(!host||signal?.aborted)return;ensureStyle();
 const box=document.createElement('details');box.className='content-reward-inbox';box.hidden=true;const summary=document.createElement('summary'),list=document.createElement('div');summary.textContent='미수령 봉인 보상';box.append(summary,list);host.prepend(box);let loading=false,cursor=null;
 async function load(more=false){
  if(loading||signal?.aborted)return;loading=true;
  try{const data=await api('rewards/reveal/pending'+(more&&cursor?'?after='+encodeURIComponent(cursor):''),{signal,timeoutMs:15000});if(signal?.aborted)return;if(!more)list.replaceChildren();list.querySelector('[data-more]')?.remove();
   for(const offer of data.offers){const row=document.createElement('article'),label=document.createElement('b');label.textContent=rewardRevealContent(offer.content)?.name||'전리품';row.append(label);mountRewardRevealButton(row,offer,{signal});row.dataset.pendingOffer=offer.offerId;list.append(row);}
   cursor=data.nextCursor;if(cursor){const moreButton=document.createElement('button');moreButton.type='button';moreButton.dataset.more='';moreButton.textContent='더 보기';moreButton.onclick=()=>void load(true);list.append(moreButton);}box.hidden=!list.children.length;
  }catch(error){if(!signal?.aborted){box.hidden=false;summary.textContent='미수령 봉인 보상 확인';list.textContent=error.message;const retry=document.createElement('button');retry.type='button';retry.textContent='다시 확인';retry.onclick=()=>void load();list.append(retry);}}finally{loading=false;}
 }
 window.addEventListener('cnine:reward-reveal-claimed',event=>{list.querySelector('[data-pending-offer="'+event.detail.offerId+'"]')?.remove();box.hidden=!list.children.length;},{signal});void load();
 return {refresh:()=>load()};
}
