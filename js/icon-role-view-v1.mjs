import {ICON_ROLES,iconDefinition} from '../shared/icon-roles-v1.mjs';
import {ICON_SUPREMACY} from '../shared/icon-supremacy-v1.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={lightning:'M14 2 4 14h7l-1 8 10-13h-7z',daggers:'M5 3l6 10-3 3L2 7zm14 0-6 10 3 3 6-9zM8 16l-4 5m12-5 4 5M4 13l7 6m9-6-7 6',barrage:'M3 6h13l5 3-5 3H3zM5 15h11m-9 4h7m-3-9v5',arcane:'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM4 3l2 2m12 14 2 2',resonance:'M12 3v18m-4-15v12m8-12v12M4 9v6m16-6v6',curse:'M3 9c5-6 13-6 18 0-5 6-13 6-18 0zm9-3v6M5 16l3 3m11-3-3 3m-4-4v7',guard:'M12 2 3 6v7c0 4 9 9 9 9s9-5 9-9V6zM8 12l3 3 5-6',charge:'M3 17 14 6m-6 0h6v6M9 21 21 9m-6 0h6v6'};
export const iconRoleGlyph=def=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[def.glyph]||paths.arcane}"/></svg>`;
let settings=null,inflight=null;
export async function loadIconRoleView(){
 if(inflight)return inflight;
 inflight=fetch('/api/icons/roles',{cache:'no-store',credentials:'same-origin'}).then(async r=>{if(!r.ok)throw Error('역할 설정을 불러오지 못했습니다.');const x=await r.json();if(!x.document?.cards?.length)throw Error('역할 설정 형식을 확인하지 못했습니다.');settings=x;return x;}).finally(()=>{inflight=null;});return inflight;
}
export function iconRoleDescription(card,{compact=false}={}){
 const d=iconDefinition(card);if(!d)return '';
 const row=settings?.document.cards.find(c=>c.code===d.code),c=row?.tuning;
 const timing=c?`첫 ${c.firstAction}행동${d.role==='MAGIC'?' 집중 후 다음 행동 발사':''} · 재사용 ${c.cooldownActions}행동 · 최대 ${c.maxCasts}회`:'발동 조건을 확인하고 있습니다…';
 const superiority=`<p class="ir-superiority"><b>최고등급 우위 · 덱 최대 ${ICON_SUPREMACY.deckLimit}장</b><span>동일 장비 조건의 FUR +15·전직 기준보다 공격·방어·체력·속도 최소 20% 상위 능력치를 적용합니다. FUR 설정 변경 시 자동 반영되며 역할별 특화 효과가 추가됩니다.</span></p>`;
 return `<section class="ir-profile${compact?' is-compact':''}" style="--ir-accent:${d.color}" data-icon-role="${d.code}"><header><span class="ir-emblem">${iconRoleGlyph(d)}</span><div><small>ICON / ${d.role}</small><h3>${d.label} <span>${d.archetype}</span></h3></div></header><div class="ir-abilities"><article><small>PASSIVE · 고유 패시브</small><h4>${d.passive}</h4><p>${d.passiveText}</p></article><article><small>SIGNATURE · 전용 스킬</small><h4>${d.skill}</h4><p>${d.skillText}</p></article></div>${superiority}${d.acquisitionText?`<p class="ir-timing">${esc(d.acquisitionText)}</p>`:''}<p class="ir-timing">${esc(timing)}</p>${settings&&!settings.document.enabled||row&&!row.enabled?'<p class="ir-disabled">현재 역할 효과가 비활성화되어 있습니다.</p>':''}${!compact&&c?`<details class="ir-values"><summary>상세 효과 수치</summary><dl>${d.fields.map(f=>`<div><dt>${esc(f.label)}</dt><dd>${c[f.key]} <small>${esc(f.unit)}</small></dd></div>`).join('')}</dl><p>행동은 해당 캐릭터의 서버 판정 기준입니다. 재생 속도로 발동 주기가 바뀌지 않습니다.</p></details>`:''}</section>`;
}
export function openIconRoleProfile(card){
 const d=iconDefinition(card),modal=document.getElementById('modal');if(!d||!modal)return;
 const previous=document.activeElement;
 modal.className='modal show detail-modal card-profile-modal';
 modal.innerHTML=`<div class="modal-panel ir-modal" role="dialog" aria-modal="true" aria-label="${esc(d.name)} ICON 고유효과"><header class="ir-modal-head"><div><small>ICON / COMBAT IDENTITY</small><h2>${esc(d.name)}</h2></div><button type="button" class="ir-close" aria-label="닫기">×</button></header><div class="ir-modal-body"><aside>${globalThis.IconFusion?.cardHtml({...card,id:d.cardId},true,'ir-portrait')||''}<p>기본 전투력 <b>180,000</b></p><small>전투 시 FUR +15 상위 보정 · 추가 강화 불가</small></aside><div class="ir-modal-profile">${iconRoleDescription(card)}</div></div><p class="ir-load-status" role="status"></p></div>`;
 const close=()=>{modal.className='modal';modal.innerHTML='';document.removeEventListener('keydown',key);previous?.focus?.();};
 const key=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button,summary,a,input')].filter(n=>n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
 modal.querySelector('.ir-close').onclick=close;document.addEventListener('keydown',key);modal.querySelector('.ir-close').focus();
 const panel=modal.querySelector('.ir-modal-profile'),status=modal.querySelector('.ir-load-status');
 loadIconRoleView().then(()=>{if(panel.isConnected)panel.innerHTML=iconRoleDescription(card);}).catch(e=>{if(status.isConnected)status.textContent=e.message;});
}
if(typeof window!=='undefined')window.IconRoles={definition:iconDefinition,description:iconRoleDescription,load:loadIconRoleView,open:openIconRoleProfile,roles:ICON_ROLES};
