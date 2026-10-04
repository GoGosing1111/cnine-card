import {ICON_ROLES} from '../shared/icon-roles-v1.mjs';
import {iconRoleGlyph} from '../js/icon-role-view-v1.mjs';
import {mercenaryCmsRequest} from './mercenary-request-v1.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountIconRoleEditor(root,{request=options=>mercenaryCmsRequest(options,'/api/admin/icon-roles')}={}){
 let state=null,draft=null,selected=ICON_ROLES[0].code,busy=false,dirty=false,pending=null,disposed=false;
 const say=message=>{const el=root.querySelector('[data-ir-status]');if(el)el.textContent=message;};
 const row=()=>draft?.cards.find(c=>c.code===selected);
 function controls(){root.querySelectorAll('input,button').forEach(el=>el.disabled=busy||!!pending&&el.tagName==='INPUT');const b=root.querySelector('[data-ir-save]');if(b){b.disabled=busy||!state||(!dirty&&!pending);b.textContent=pending?'저장 결과 재확인':'역할 효과 저장';}}
 function draw(){
  if(disposed)return;
  const d=ICON_ROLES.find(c=>c.code===selected),r=row();
  root.style.setProperty('--ir-accent',d.color);
  root.innerHTML=`<header class="ir-editor-head"><span class="ir-emblem">${iconRoleGlyph(d)}</span><div><small>ICON ROLE / ${d.role}</small><h3>${esc(d.name)} <em>${d.label}</em></h3><p>${d.archetype}</p></div><span class="ir-version">정책 V${state?.revision||'—'}</span></header>
   <div class="ir-abilities"><article><small>PASSIVE</small><h4>${d.passive}</h4><p>${d.passiveText}</p></article><article><small>SIGNATURE</small><h4>${d.skill}</h4><p>${d.skillText}</p></article></div>
   ${r?`<div class="ir-switches"><label><input type="checkbox" data-ir-global ${draft.enabled?'checked':''}> ICON 역할 효과 사용</label><label><input type="checkbox" data-ir-card ${r.enabled?'checked':''}> ${d.name} 효과 사용</label>${['pve','pvp','captain'].map(k=>`<label><input type="checkbox" data-ir-scope="${k}" ${draft.scopes[k]?'checked':''}> ${k==='captain'?'족장전':k.toUpperCase()}</label>`).join('')}</div><p class="ir-editor-note">저장한 설정은 새로 시작하는 전투부터 적용됩니다. 행동 주기는 캐릭터 본인 행동 기준입니다. 합성 오픈 설정은 별도입니다.</p><div class="ir-fields">${d.fields.map(f=>`<label><span>${f.label}</span><div><input type="number" data-ir-field="${f.key}" min="${f.min}" max="${f.max}" step="${f.integer?'1':'0.1'}" value="${r.tuning[f.key]}" aria-label="${d.name} ${f.label}" required><small>${f.unit}</small></div></label>`).join('')}</div>`:'<p class="ir-editor-note">역할 설정을 불러오고 있습니다…</p>'}
   <footer class="ir-editor-footer"><p data-ir-status role="status" aria-live="polite">${dirty?'저장하지 않은 설정이 있습니다.':state?'7개 역할 · 전투 서버와 동일한 설정':'연결 중…'}</p><div><button type="button" data-ir-export>편집본 내려받기</button><button type="button" data-ir-reload>다시 불러오기</button><button type="button" data-ir-save>역할 효과 저장</button></div></footer>`;
  controls();
 }
 async function load(){if(busy||disposed)return;busy=true;controls();try{const x=await request();if(disposed)return;state=x;draft=structuredClone(x.document);dirty=false;pending=null;draw();say(`역할 설정 버전 ${state.revision} · 합성 잠금과 별도 운영`);}catch(e){say(e.message);}finally{busy=false;controls();}}
 async function save(){
  if(busy||!state||disposed)return;
  if(!pending){if(![...root.querySelectorAll('input[type=number]')].every(el=>el.reportValidity()))return;pending={requestId:crypto.randomUUID(),expectedRevision:state.revision,document:structuredClone(draft)};}
  busy=true;controls();say('전투 설정을 저장하고 있습니다…');
  try{const x=await request({method:'PATCH',body:JSON.stringify(pending)});if(disposed)return;state=x;draft=structuredClone(x.document);dirty=false;pending=null;draw();say(`저장 완료 · 버전 ${x.revision} · 새 전투부터 적용`);}catch(e){if(e.status>=400&&e.status<500)pending=null;say(e.message+(pending?' 같은 요청으로 저장 결과를 다시 확인할 수 있습니다.':''));}finally{busy=false;controls();}
 }
 root.addEventListener('input',e=>{if(!draft||busy||pending)return;const el=e.target;if(el.matches('[data-ir-field]'))row().tuning[el.dataset.irField]=el.value===''?null:Number(el.value);else if(el.matches('[data-ir-global]'))draft.enabled=el.checked;else if(el.matches('[data-ir-card]'))row().enabled=el.checked;else if(el.matches('[data-ir-scope]'))draft.scopes[el.dataset.irScope]=el.checked;else return;dirty=true;say('저장하지 않은 역할 설정이 있습니다.');controls();});
 root.addEventListener('click',e=>{if(busy)return;if(e.target.closest('[data-ir-save]'))void save();if(e.target.closest('[data-ir-reload]')){if((dirty||pending)&&!confirm('저장하지 않은 편집을 버리고 다시 불러올까요?'))return;void load();}if(e.target.closest('[data-ir-export]')&&draft){const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='icon-role-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});
 draw();void load();return {select(code){if(!ICON_ROLES.some(d=>d.code===code))return;selected=code;draw();},dispose(){disposed=true;root.replaceChildren();}};
}
