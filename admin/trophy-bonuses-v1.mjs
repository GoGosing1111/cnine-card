import {validateTrophyBonuses} from '../shared/trophy-bonuses-v1.mjs?v=20261014-reward1';
import {REWARD_BONUS_LABELS,REWARD_BONUS_HELP} from '../shared/collection-bonuses-v1.mjs?v=20261014-reward1';
import {jointAdminRequest} from '../js/joint-account-transport.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountTrophyBonuses(root,{request=jointAdminRequest}={}){
  let state=null,draft=null,pending=null,busy=false,dirty=false,disposed=false;
  root.classList.add('trophy-bonus-cms');
  root.innerHTML=`<header class="tb-heading"><div><span>COLLECTION BENEFITS</span><h2>트로피 보유 효과</h2><p>쌓아 온 기록에 세 가지 혜택을 더하세요.</p></div><b>보유 즉시 적용</b></header><p class="tb-help">${REWARD_BONUS_HELP} 최초 설정은 모두 0%이며, 저장한 값은 다음 보상 판정부터 적용됩니다.</p><div class="tb-roster" data-tb-roster></div><footer class="tb-footer"><p data-tb-status role="status">불러오는 중입니다.</p><button type="button" data-tb-reload>새로고침</button><button type="button" data-tb-save>변경사항 저장</button></footer>`;
  const $=s=>root.querySelector(s),status=(s,error=false)=>{$('[data-tb-status]').textContent=s;$('[data-tb-status]').classList.toggle('is-error',error);};
  function sync(){root.setAttribute('aria-busy',String(busy));root.querySelectorAll('input').forEach(e=>e.disabled=busy||!!pending);$('[data-tb-save]').disabled=busy||!state||!dirty&&!pending;$('[data-tb-save]').textContent=pending?'같은 저장 결과 재확인':'변경사항 저장';$('[data-tb-reload]').disabled=busy||!!pending;}
  function render(){
    $('[data-tb-roster]').innerHTML=state.catalog.map(t=>{
      const row=draft.trophies.find(r=>r.code===t.code);
      return `<article class="tb-card"><div class="tb-trophy"><img src="${esc(t.art)}" alt="${esc(t.name)}"><div><small>${esc(t.category)}</small><h3>${esc(t.name)}</h3><p>${esc(t.rule)}</p></div></div><div class="reward-bonus-fields">${Object.entries(REWARD_BONUS_LABELS).map(([key,label])=>`<label>${label}<span><input type="number" min="0" max="1000" step="0.01" data-tb-code="${esc(t.code)}" data-tb-key="${key}" aria-label="${esc(t.name)} ${label}" value="${row.rewardBonuses[key]}"><i>%</i></span></label>`).join('')}</div><p class="tb-once">동일 트로피는 여러 개 보유해도 1회 적용</p></article>`;
    }).join('');sync();
  }
  async function load(){busy=true;sync();status('보유 효과를 불러오는 중입니다.');try{const data=await request('admin/trophy-bonuses');if(disposed)return;state=data;draft=validateTrophyBonuses(data.document);dirty=false;pending=null;render();status('설정을 불러왔습니다. 0%는 해당 보너스 미적용입니다.');}catch(e){if(!disposed)status(e.message,true);}finally{busy=false;if(!disposed)sync();}}
  async function save(){
    try{pending||={document:validateTrophyBonuses(draft),expectedRevision:state.revision,requestId:crypto.randomUUID()};}catch(e){status(e.message,true);return;}
    busy=true;sync();status('보유 효과를 저장하고 있습니다.');
    try{const data=await request('admin/trophy-bonuses',{method:'PATCH',body:pending});if(disposed)return;state=data;draft=validateTrophyBonuses(data.document);dirty=false;pending=null;render();status(`저장 완료 · 버전 ${data.revision}`);}catch(e){if(!disposed){if(e.status&&e.status<500)pending=null;status(e.message,true);}}finally{busy=false;if(!disposed)sync();}
  }
  root.addEventListener('input',e=>{const input=e.target;if(!input.dataset.tbCode||busy||pending)return;const row=draft.trophies.find(r=>r.code===input.dataset.tbCode);row.rewardBonuses[input.dataset.tbKey]=input.value===''?NaN:Number(input.value);dirty=true;status('변경사항을 저장하면 이후 보상에 적용됩니다.');sync();});
  $('[data-tb-save]').addEventListener('click',save);$('[data-tb-reload]').addEventListener('click',()=>{if(!dirty||confirm('저장하지 않은 변경을 버리고 다시 불러올까요?'))void load();});
  void load();return {dispose(){disposed=true;root.replaceChildren();}};
}
function install(){
  const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;
  const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='트로피 보유 효과';button.dataset.view='trophy-bonuses';button.hidden=true;panel.className='view';panel.id='view-trophy-bonuses';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=null;
  button.addEventListener('click',e=>{e.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='트로피 보유 효과';mounted||=mountTrophyBonuses(panel);},true);
  const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;mounted?.dispose();mounted=null;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
