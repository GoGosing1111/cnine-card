import {GUIDE_VERSION,STEPS,ROUTES} from './content.mjs?v=20261024-1';
const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const embedded=parent!==window,params=new URLSearchParams(location.search),account=String(params.get('account')||'guest').slice(0,80),storageKey='cnine.growth-guide.'+GUIDE_VERSION+':'+account;
let index=0,checked=new Set();
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))checked=new Set(saved.filter(id=>STEPS.some(step=>step.id===id)));}catch{}
const routeLink=([route,label])=>ROUTES[route]?`<a class="skin route-link" href="${esc(ROUTES[route])}" data-route="${esc(route)}">${esc(label)} <span aria-hidden="true">↗</span></a>`:'';
function updateProgress(){
 $('steps').innerHTML=STEPS.map((step,i)=>`<button type="button" class="skin step-button" data-step="${i}" ${index===i?'aria-current="step"':''}><span class="step-number" aria-hidden="true">${checked.has(step.id)?'✓':String(i+1).padStart(2,'0')}</span><strong>${esc(step.label)}</strong>${checked.has(step.id)?'<span class="sr-status" hidden>확인함</span>':''}</button>`).join('');
 $('progress').textContent=`내가 확인한 항목 ${checked.size} / ${STEPS.length}`;
}
function render(focus=false){
 const step=STEPS[index];updateProgress();
 $('guide-content').innerHTML=`<header class="step-intro"><p class="eyebrow">${esc(step.eyebrow)}</p><h2 id="step-title" tabindex="-1">${esc(step.title)}</h2><p class="lead">${esc(step.lead)}</p></header>
 ${step.stats?`<div class="stats">${step.stats.map(([value,label])=>`<div class="skin stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('')}</div>`:''}
 <div class="step-body ${step.art?'with-art':''}"><div class="blocks">${step.blocks.map(block=>`<section class="guide-block"><h3>${esc(block.title)}</h3><p>${esc(block.body)}</p>${block.table?`<table><caption class="table-caption" hidden>${esc(block.title)}</caption><thead><tr>${block.table.headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${block.table.rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`:''}${block.list?`<ul>${block.list.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}${block.links?`<div class="route-links">${block.links.map(routeLink).join('')}</div>`:''}</section>`).join('')}</div>${step.art?`<figure class="guide-art"><img src="${esc(step.art.src)}" alt="${esc(step.art.alt)}" decoding="async"><figcaption>${esc(step.art.caption)}</figcaption></figure>`:''}</div>
 <p class="takeaway">${esc(step.takeaway)}</p><label class="read-check"><input id="read-check" type="checkbox" ${checked.has(step.id)?'checked':''}>${esc(step.check)}</label>
 <nav class="pagination" aria-label="성장팁 앞뒤 이동"><button type="button" class="skin" data-prev ${index===0?'disabled':''}>← 이전</button><span>${index+1} / ${STEPS.length}</span><button type="button" class="skin next" data-next>${index===STEPS.length-1?'안내 닫기':'다음 →'}</button></nav>`;
 if(focus){$('step-title').focus({preventScroll:true});$('guide-content').scrollIntoView({block:'start',behavior:'instant'});}
}
function close(){if(embedded)parent.postMessage({type:'cnine:lobby-guide:close'},location.origin);else location.assign('/?screen=home');}
document.addEventListener('click',event=>{
 const step=event.target.closest('[data-step]');if(step){index=Number(step.dataset.step);render(true);return;}
 if(event.target.closest('[data-prev]')){index=Math.max(0,index-1);render(true);return;}
 if(event.target.closest('[data-next]')){if(index===STEPS.length-1)close();else{index++;render(true);}return;}
 if(event.target.closest('[data-close]')){event.preventDefault();close();return;}
 const link=event.target.closest('[data-route]');if(link&&embedded&&ROUTES[link.dataset.route]){event.preventDefault();parent.postMessage({type:'cnine:lobby-guide:navigate',route:link.dataset.route},location.origin);}
});
document.addEventListener('change',event=>{if(event.target.id!=='read-check')return;const id=STEPS[index].id;if(event.target.checked)checked.add(id);else checked.delete(id);try{localStorage.setItem(storageKey,JSON.stringify([...checked]));}catch{}updateProgress();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
try{render();}catch{const p=document.createElement('p');p.textContent='성장팁을 불러오지 못했습니다. 새로고침한 뒤 다시 확인해 주세요.';$('guide-content').replaceChildren(p);}
