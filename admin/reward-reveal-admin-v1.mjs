import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {mountCoreRewardAdmin} from './core-raid-rewards-v1.mjs?v=20261029-blackwing-rewards1';
import {REWARD_REVEAL_CONTENTS} from '../shared/reward-reveal-contents-v1.mjs?v=20261029-blackwing-rewards1';
export async function mountRewardRevealCms(root){
 root.classList.add('reveal-cms');
 root.innerHTML='<header class="reveal-cms-hero"><small>REWARD STUDIO</small><h2>연출 보상</h2><p>콘텐츠별 전리품을 설계하세요.</p><span>봉인 선택 → 보관함 개방 → 보상 획득</span></header><p class="reveal-cms-notice">각 콘텐츠의 후보·수량·확률 비중은 독립적으로 저장됩니다. 기본 보상과 수령 한도는 기존 콘텐츠 설정을 따르며, TEST·OFF 전투에는 봉인을 지급하지 않습니다.</p><p data-reveal-status role="status">연결된 콘텐츠를 불러오는 중입니다.</p><nav class="reveal-cms-contents" aria-label="보상 콘텐츠"></nav><div data-reveal-editors></div>';
 const status=root.querySelector('[data-reveal-status]'),nav=root.querySelector('nav'),editors=root.querySelector('[data-reveal-editors]'),mounted=new Map();let data;
 async function load(){data=await api('admin/reward-reveal');return data;}
 function labels(){for(const button of nav.children){const p=data.policies[button.dataset.content];button.querySelector('small').textContent=(p.enabled?'ON · 연결됨':'OFF · 설정 준비')+' / r'+p.revision;button.dataset.enabled=String(p.enabled);}}
 function show(content){
  for(const button of nav.children)button.setAttribute('aria-pressed',String(button.dataset.content===content.id));
  for(const [id,host]of mounted)host.hidden=id!==content.id;
  if(mounted.has(content.id))return;
  const host=document.createElement('div'),anchor=document.createElement('div');host.append(anchor);editors.append(host);mounted.set(content.id,host);let first=true;
  mountCoreRewardAdmin(anchor,{id:'reward-reveal-'+content.id,content:content.id,name:content.name,limit:content.limit,
   api:async body=>{
    if(body){const result=await api('admin/reward-reveal',{method:'POST',body:{...body,content:content.id}});data.policies[content.id]=result.policy;labels();return result;}
    if(!first)await load();first=false;labels();return {policy:structuredClone(data.policies[content.id]),catalog:data.catalog};
   },onSaved:()=>{status.textContent=content.name+' 설정을 저장했습니다.';}});
 }
 try{
  await load();status.textContent='보상을 설정할 콘텐츠를 선택하세요.';
  for(const content of REWARD_REVEAL_CONTENTS){const button=document.createElement('button');button.type='button';button.dataset.content=content.id;button.innerHTML='<span></span><b></b><small></small>';button.querySelector('span').textContent=content.group;button.querySelector('b').textContent=content.name;button.onclick=()=>show(content);nav.append(button);}
  labels();show(REWARD_REVEAL_CONTENTS[0]);
 }catch(error){status.textContent=error.message;const retry=document.createElement('button');retry.type='button';retry.textContent='다시 불러오기';retry.onclick=()=>void mountRewardRevealCms(root);status.append(retry);}
}
function install(){
 const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role||document.getElementById('view-reward-reveal'))return;
 const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='연출 보상';button.dataset.view='reward-reveal';button.hidden=true;panel.id='view-reward-reveal';panel.className='view';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=false;
 button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='연출 보상';if(!mounted){mounted=true;void mountRewardRevealCms(panel);}},true);
 const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();mounted=false;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
