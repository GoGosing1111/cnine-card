import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {V3_LIVE_CONNECTIONS} from '../shared/v3-live-connections.mjs';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function install(){
 const style=document.createElement('link');style.rel='stylesheet';style.href='/admin/v3-live-connections.css?v=2091';document.head.append(style);
 const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;
 const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='V3 실게임 연결';button.dataset.view='v3-connections';button.hidden=true;panel.className='view';panel.id='view-v3-connections';panel.hidden=true;nav.append(button);cms.append(panel);
 async function load(){panel.innerHTML='<h2>V3 실게임 연결</h2><p role="status">운영 설정을 확인하고 있습니다.</p>';
  try{const [release,mercenary,runtime]=await Promise.all([api('pve/v3/feature'),api('admin/mercenaries'),api('admin/mercenaries/runtime')]);
   const document=mercenary.document,assigned=document.assignments.filter(r=>r.skillIds.length),price=runtime.policy.opening;
   panel.innerHTML=`<h2>V3 실게임 연결</h2><p>운영 코드 연결 완료 · 유저 개방 <strong>${release.enabled?'ON':'OFF'}</strong> · 용병 CMS r${mercenary.revision}</p><p>개봉 비용: ${price.paymentKind==='COIN'?`${Number(price.coinPerOpen).toLocaleString('ko-KR')} 코인`:price.paymentKind==='ITEM'?`${escape(price.itemCode)} ${price.itemsPerOpen}개`:'미설정'} · 같은 등급 균등 추첨 · 중복 +1 집계</p><div style="display:flex;gap:10px;flex-wrap:wrap">${Object.values(V3_LIVE_CONNECTIONS).map(r=>`<a class="btn" href="${r.url}" target="_blank" rel="noopener">${r.label} ↗</a>`).join('')}</div><p>유저 개방 OFF 상태에서는 위 운영 화면의 개봉·편성·입장이 잠깁니다. 확률은 <a class="text-link" href="#mercenaries/draw">용병 운영실 → 개봉 확률</a>에서 관리합니다.</p><h3>운영 스킬 배정 ${assigned.length}명</h3><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>등급 · 용병</th><th>배정 스킬 · 효과</th><th>수치 검수</th></tr></thead><tbody>${assigned.map(row=>{const c=document.mercenaries.find(c=>c.code===row.code),skills=row.skillIds.map(id=>document.skills.find(s=>s.id===id));return `<tr><td style="padding:12px;vertical-align:top">${escape(c.rank)} · ${escape(c.name)}</td><td style="padding:12px">${skills.map(s=>`<p><b>${escape(s.name)}</b><br><small>${escape(s.effect)}</small></p>`).join('')}</td><td style="padding:12px;vertical-align:top">${skills.every(s=>s.review==='REVIEWED'&&Object.values(s.balance).every(v=>v!==null))?'완료':'설정 대기'}</td></tr>`;}).join('')}</tbody></table></div><button type="button" data-reload>다시 확인</button><p role="status">실제 운영 CMS를 조회했습니다.</p>`;
   panel.querySelector('[data-reload]').onclick=load;
  }catch(e){panel.querySelector('[role="status"]').textContent=e.message;}
 }
 button.addEventListener('click',e=>{e.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='V3 실게임 연결';void load();},true);
 const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
