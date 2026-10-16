import {DEFENSE_DIFFICULTIES,DEFENSE_ENEMIES,validateDefenseSettings} from '../shared/monster-defense-v1.mjs?v=20261016-test1';
import {jointAdminRequest} from '../js/joint-account-transport.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountDefenseCms(root){
 let settings=null,pending=null,busy=false;const names=new Map();
 root.innerHTML='<header class="md-head"><div><small>MONSTER DEFENSE · TEST</small><h2>디펜스 관리</h2><p>2~3인 · 용병 2명 + 카드 1장 · 난이도별 몬스터와 보스</p></div><a href="/defense/" target="_blank" rel="noopener">디펜스 열기 ↗</a></header><form class="md-form"><section class="md-controls"><label>운영 상태<select name="mode"><option value="OFF">OFF · 입장 중지</option><option value="TEST">TEST · OWNER + 지정 계정</option></select></label><div><b>테스트 계정</b><p>모든 OWNER는 자동 허용됩니다. 정확한 닉네임 또는 계정 ID로 추가하세요.</p><div class="md-search"><input data-search placeholder="정확한 닉네임 또는 계정 ID"><button type="button" data-find>계정 찾기</button></div><div data-found></div><div data-testers></div></div></section><section><h3>난이도 설정</h3><p>새 방부터 적용됩니다. 웨이브·몬스터 구성·보스 패턴은 아래 구성표를 따릅니다.</p><div class="md-table-wrap"><table><thead><tr><th>난이도</th><th>사용</th><th>체력 %</th><th>공격 %</th><th>속도 %</th><th>등장 수 %</th><th>수호석 HP</th></tr></thead><tbody data-difficulties></tbody></table></div></section><footer><p data-status role="status">불러오는 중…</p><button type="button" data-reload>새로고침</button><button type="submit" data-save>설정 저장</button></footer></form><section class="md-encounters"><h3>난이도별 보스</h3><div class="md-boss-grid"></div><h3>등장 리소스 13종</h3><div class="md-resource-grid"></div><p>TEST 편성은 제공된 캐릭터와 전술로 정규화됩니다. 계정 보유분·재화·보상에 영향을 주지 않습니다.</p></section>';
 const $=s=>root.querySelector(s),note=s=>$('[data-status]').textContent=s;
 function lock(value){busy=value;root.querySelectorAll('input,select,button').forEach(e=>e.disabled=value||!settings);}
 function testers(){$('[data-testers]').innerHTML=settings.testUserIds.map(id=>`<button type="button" data-remove="${id}">${esc(names.get(id)||'계정 #'+id)} ×</button>`).join('')||'<span>등록된 일반 테스트 계정 없음</span>';}
 function draw(){
  $('[name=mode]').value=settings.mode;testers();
  $('[data-difficulties]').innerHTML=settings.difficulties.map((d,i)=>`<tr data-difficulty="${d.id}"><th>${DEFENSE_DIFFICULTIES[i].name}<small>${DEFENSE_DIFFICULTIES[i].waves} 웨이브</small></th><td><input type="checkbox" data-enabled ${d.enabled?'checked':''} aria-label="${DEFENSE_DIFFICULTIES[i].name} 사용"></td>${[['hpPercent',25,400],['attackPercent',25,400],['speedPercent',50,180],['spawnPercent',50,160],['coreHp',500,5000]].map(([k,min,max])=>`<td><input data-value="${k}" type="number" min="${min}" max="${max}" value="${d[k]}" required aria-label="${d.id} ${k}"></td>`).join('')}</tr>`).join('');
  $('.md-boss-grid').innerHTML=DEFENSE_DIFFICULTIES.map(d=>{const boss=DEFENSE_ENEMIES.find(e=>e.id===d.boss),mid=DEFENSE_ENEMIES.find(e=>e.id===d.midBoss);return `<article><span>${d.name} · ${d.waves}W</span><img src="/${boss.asset}" alt="${boss.name}"><h4>${boss.name}</h4><p>${boss.hint}</p><small>중간 ${Math.floor(d.waves/2)}W · ${mid.name}</small></article>`;}).join('');
  $('.md-resource-grid').innerHTML=DEFENSE_ENEMIES.map(e=>`<figure><img src="/${e.asset}" alt="" loading="lazy"><figcaption>${e.name}<small>${{NORMAL:'일반',RUNNER:'돌파',RANGED:'원거리',ELITE:'정예',BOSS:'보스'}[e.kind]}</small></figcaption></figure>`).join('');
 }
 async function load(){lock(true);try{settings=(await jointAdminRequest('admin/defense/settings')).settings;pending=null;draw();note('TEST 설정 r'+settings.revision+' · 저장 후 새 방부터 반영됩니다.');}catch(e){note(e.message);}finally{lock(false);}}
 $('[data-reload]').onclick=()=>void load();
 $('[data-find]').onclick=async()=>{lock(true);try{const result=await jointAdminRequest('admin/defense/test-users?q='+encodeURIComponent($('[data-search]').value.trim()));$('[data-found]').innerHTML=result.users.length?result.users.map(u=>{names.set(Number(u.id),u.nickname);return `<button type="button" data-add="${u.id}">${esc(u.nickname)} · #${u.id} 추가</button>`;}).join(''):'일치하는 계정이 없습니다.';}catch(e){note(e.message);}finally{lock(false);}};
 root.onclick=event=>{const add=event.target.closest('[data-add]'),remove=event.target.closest('[data-remove]');if(!settings||busy)return;if(add&&!settings.testUserIds.includes(Number(add.dataset.add))){settings.testUserIds.push(Number(add.dataset.add));testers();}if(remove){settings.testUserIds=settings.testUserIds.filter(id=>id!==Number(remove.dataset.remove));testers();}};
 $('.md-form').onsubmit=async event=>{
  event.preventDefault();if(busy||!settings)return;
  try{
   if(!pending){const value={...settings,mode:$('[name=mode]').value,difficulties:settings.difficulties.map(d=>{const row=$(`[data-difficulty="${d.id}"]`),next={...d,enabled:row.querySelector('[data-enabled]').checked};row.querySelectorAll('[data-value]').forEach(input=>next[input.dataset.value]=Number(input.value));return next;})};pending={settings:validateDefenseSettings(value),requestId:crypto.randomUUID()};}
   lock(true);const result=await jointAdminRequest('admin/defense/settings',{method:'POST',body:pending});settings=result.settings;pending=null;draw();note('저장 완료 · r'+settings.revision+' · 계정 보상 비활성');
  }catch(e){note(e.message+' · 다시 저장하면 같은 요청을 확인합니다.');}finally{lock(false);}
 };
 await load();
}
function install(){
 const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role||document.getElementById('view-monster-defense'))return;
 const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='디펜스 · TEST';button.dataset.view='monster-defense';button.hidden=true;panel.id='view-monster-defense';panel.className='view md-admin';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=false;
 button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='디펜스 · TEST';if(!mounted){mounted=true;void mountDefenseCms(panel);}},true);
 const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();mounted=false;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
