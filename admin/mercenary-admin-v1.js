import {validateMercenaryCms,ACQUISITIONS,REVIEWS} from '../shared/mercenary-cms-model-v1.mjs?v=20260912-cms1';
import {createMercenaryDrawEditor} from './mercenary-draw-admin-v1.js?v=20260913-uniform1';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asset=path=>'/'+String(path||'').replace(/^\/+/, '');
const thumb=(code,size=320)=>`/assets/ui/project-v/mercenaries/codex-v1/${code.toLowerCase()}-art-${size}.webp`;
const date=value=>new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
let section,button,data,tab='roster',selected='V-004',skill='MS-021',query='',dirty=false,busy=false,pending=null,notice='',error=false;
const $=selector=>section?.querySelector(selector);
const tabs={roster:'용병 도감',skills:'스킬 목록',assignments:'스킬 배정',draw:'개봉 확률',economy:'획득 · 성장',review:'리소스 · 검수'};
const drawEditor=createMercenaryDrawEditor({request:options=>api(options,'/api/admin/mercenaries/draw'),onRender:()=>render()});
async function api(options={},endpoint='/api/admin/mercenaries'){
  const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(endpoint,{...options,signal:controller.signal,cache:'no-store',headers:{'content-type':'application/json',authorization:`Bearer ${token}`}});
    const value=await response.json();if(!response.ok){const e=Error(value.error||`요청 실패 (${response.status})`);e.status=response.status;throw e;}return value;
  }finally{clearTimeout(timer);}
}
function field(label,path,value,{type='text',max=2000,wide=false,step='1',min='0',disabled=false}={}){
  const attrs=`data-field="${esc(path)}" ${disabled?'disabled':''}`;
  return `<label class="mc-field ${wide?'mc-wide':''}"><span>${esc(label)}</span>${type==='textarea'?`<textarea ${attrs} maxlength="${max}" rows="3">${esc(value)}</textarea>`:`<input ${attrs} type="${type}" value="${esc(value)}" ${type==='number'?`min="${min}" step="${step}" placeholder="미정"`:`maxlength="${max}"`} >`}</label>`;
}
function select(label,path,value,options,disabled=false){return `<label class="mc-field"><span>${esc(label)}</span><select data-field="${esc(path)}" ${disabled?'disabled':''}>${Object.entries(options).map(([key,label])=>`<option value="${esc(key)}" ${String(value??'')===key?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;}
function fields(title,description,content){return `<section class="mc-fields-section"><div class="mc-section-title"><h3>${title}</h3><p>${description}</p></div><div class="mc-fields">${content}</div></section>`;}
function powerReference(rank){const power=data?.powerStandard?.basePowerByRank?.[rank];return `<div class="mc-field"><span>${esc(rank||'미정')} · 승인 기본 전투력</span><output class="mc-power-value" data-power-rank="${esc(rank||'UNSET')}">${Number.isSafeInteger(power)?power.toLocaleString('ko-KR'):'등급 선택 후 확인'}</output></div>`;}
function rankPowerReferences(){return data?.powerStandard?fields('등급별 기본 전투력 · 확정','획득 직후 기준 · 성장·장비·스킬 적용 전 · 실제 전투는 공동 출시 대기',data.catalog.ranks.map(powerReference).join('')):'';}
function current(){return data.document.mercenaries.find(row=>row.code===selected);}
function list(){
  const rows=data.document.mercenaries.filter(r=>(`${r.code} ${r.name} ${r.title} ${r.rank||'미정'}`).toLowerCase().includes(query.toLowerCase()));
  return `<div class="mc-roster-list" role="list" aria-label="용병 목록">${rows.map(r=>`<button type="button" class="mc-roster-row ${r.code===selected?'is-selected':''}" data-code="${r.code}" aria-pressed="${r.code===selected}"><img src="${thumb(r.code)}" alt="" loading="lazy"><span><small>${r.code} · ${esc(data.catalog.positions[r.position].label)}</small><b>${esc(r.name)}</b></span><em>${esc(r.rank||'—')}</em></button>`).join('')||'<p class="mc-empty">검색 결과가 없습니다.</p>'}</div>`;
}
function rosterRail(){return `<div class="mc-rail"><label class="mc-search"><span>용병 찾기</span><input data-search aria-label="용병 검색" type="search" placeholder="이름 · 코드 · 등급" value="${esc(query)}"></label><div data-roster-list>${list()}</div></div>`;}
function identity(row){
  const source=data.catalog.cards.find(c=>c.code===row.code);
  return `<div class="mc-identity" style="--mc-character:${source.accent}"><div class="mc-art"><img src="${thumb(row.code,640)}" alt="${esc(row.name)} 카드 원화"><span>${row.code}</span></div><div class="mc-ident-copy"><small>PROJECT V / MERCENARY</small><p>${esc(row.title)}</p><h3>${esc(row.name)}</h3><div class="mc-ident-tags"><b>${esc(row.rank||'등급 미정')}</b><span>${esc(data.catalog.positions[row.position].label)} · ${esc(data.catalog.roles[row.role].label)}</span></div><div class="mc-sd"><img src="${asset(source.battleSprite)}" alt="${esc(row.name)} 전투 SD" loading="lazy"><span>전투 SD<br><b>별도 리소스 등록</b></span></div><a href="${asset(source.sourceArt)}" target="_blank" rel="noopener">원본 원화 열기 ↗</a></div></div>`;
}
function rosterEditor(){
  const r=current(),root=`mercenaries.${data.document.mercenaries.indexOf(r)}.`,role=data.catalog.roles[r.role];
  return `<div class="mc-workspace">${rosterRail()}<div class="mc-editor">${identity(r)}${fields('01 / 기본 정보','등급 변경은 CMS 초안에 저장됩니다.',
    field('이름',root+'name',r.name,{max:60})+field('칭호',root+'title',r.title,{max:100})+
    select(r.code==='V-021'?'등급 · 사용자 확정':'등급',root+'rank',r.rank,{'':'미정',...Object.fromEntries(data.catalog.ranks.map(x=>[x,x]))},r.code==='V-021')+
    select('검수 상태',root+'review',r.review,REVIEWS))}
    ${fields('02 / 전투 포지션','일반 카드 5장과 별도로 용병 1장을 편성하는 구조입니다.',
      select('역할',root+'role',r.role,Object.fromEntries(Object.entries(data.catalog.roles).map(([k,v])=>[k,v.label])))+
      select('포지션',root+'position',r.position,Object.fromEntries(role.positions.map(k=>[k,data.catalog.positions[k].label])))+
      select('기본 공격 대상',root+'basicTarget',r.basicTarget,{FRONT_ENEMY:'적 전열 우선'},true)+
      select('스킬 대상',root+'skillTarget',r.skillTarget,Object.fromEntries(role.targets.map(k=>[k,data.catalog.targets[k].label])))+
      field('강점',root+'specialty',r.specialty,{type:'textarea',max:240})+field('약점',root+'weakness',r.weakness,{type:'textarea',max:240})+
      field('설계 의도',root+'rationale',r.rationale,{type:'textarea',max:240,wide:true}))}
    ${fields('03 / 기본 능력치','기준 전투력은 성장·장비·스킬 적용 전 수치입니다. 역할별 능력치 배분은 준비 중입니다.',powerReference(r.rank)+Object.entries({hp:'체력',attack:'공격력',defense:'방어력',speed:'속도'}).map(([key,label])=>field(label,root+'stats.'+key,r.stats[key],{type:'number'})).join(''))}
    ${fields('04 / 운영 메모','출시 전 검수 사항과 변경 의도를 기록하세요.',field('메모',root+'notes',r.notes,{type:'textarea',wide:true}))}
    </div></div>`;
}
function skillEditor(){
  const r=data.document.skills.find(s=>s.id===skill),index=data.document.skills.indexOf(r),root=`skills.${index}.`;
  const fx=data.catalog.effects.images.find(x=>x.skillId===r.id),v=data.catalog.skills.find(x=>x.id===r.id).visual;
  const reviewLink='/preview/project-v-mercenary-system-v1/skills.html';
  return `<div class="mc-workspace"><div class="mc-rail mc-skill-rail"><p class="mc-rail-caption">독립 스킬 카탈로그 <b>17</b></p>${data.document.skills.map(s=>`<button class="mc-skill-row ${s.id===skill?'is-selected':''}" data-skill="${s.id}"><small>${s.id}</small><b>${esc(s.name)}</b><span>${esc(s.role)}</span></button>`).join('')}</div><div class="mc-editor">
    <div class="mc-skill-hero"><div><small>SKILL LIBRARY / ${r.id}</small><h3>${esc(r.name)}</h3><p>${esc(r.mechanic)}</p><a href="${reviewLink}" target="_blank" rel="noopener">PixiJS · GSAP 연출 검수 열기 ↗</a></div><div class="mc-fx-contact">${fx?fx.frames.filter((_,i)=>[4,8,12].includes(i)).map(f=>`<img src="/preview/project-v-mercenary-system-v1/skill-assets-v2/${esc(f.file)}" alt="${esc(r.name)} ${f.index+1}번 프레임">`).join(''):''}<small>연속 ${fx?.frameCount||16}프레임 · ${v.duration}초</small></div></div>
    ${fields('01 / 스킬 설계','용병 배정은 별도 탭에서 직접 선택합니다.',
      field('스킬 이름',root+'name',r.name,{max:80})+select('검수 상태',root+'review',r.review,REVIEWS)+
      ['role','target','mechanic','trigger','effect','counterplay','bossRule','procRule'].map((key,i)=>field(['역할','대상','핵심 기믹','발동 조건','효과','대응 방법','보스 적용 규칙','추가 발동 규칙'][i],root+key,r[key],{type:'textarea',wide:['effect','procRule'].includes(key)})).join(''))}
    ${fields('02 / 밸런스 수치','값을 입력해도 전투에는 적용되지 않습니다.',
      field('피해 배율',root+'balance.damageRatio',r.balance.damageRatio,{type:'number',step:'any'})+
      field('재사용 대기 · 턴',root+'balance.cooldownTurns',r.balance.cooldownTurns,{type:'number'})+
      field('발동 비용',root+'balance.cost',r.balance.cost,{type:'number'})+field('검수 메모',root+'notes',r.notes,{type:'textarea',wide:true}))}
  </div></div>`;
}
function assignmentEditor(){
  const r=current(),a=data.document.assignments.find(a=>a.code===r.code);
  return `<div class="mc-workspace">${rosterRail()}<div class="mc-editor">${identity(r)}<div class="mc-assignment-head"><h3>스킬 직접 배정</h3><p>현재 ${a.skillIds.length}개 선택 · 체크 후 저장해야 배정 초안에 반영됩니다.</p></div><div class="mc-assignment-grid">${data.document.skills.map(s=>`<label class="mc-assignment ${a.skillIds.includes(s.id)?'is-checked':''}"><input type="checkbox" data-assign="${s.id}" ${a.skillIds.includes(s.id)?'checked':''}><span><small>${s.id} · ${esc(s.role)}</small><b>${esc(s.name)}</b><p>${esc(s.effect)}</p></span></label>`).join('')}</div></div></div>`;
}
function economyEditor(){
  const r=current(),root=`mercenaries.${data.document.mercenaries.indexOf(r)}.`;
  return `<div class="mc-workspace">${rosterRail()}<div class="mc-editor"><div class="mc-economy-heading"><small>ACQUISITION & GROWTH / ${r.code}</small><h3>${esc(r.name)}</h3><p>개별 획득 조건과 성장 수치를 관리합니다.</p></div>
    ${rankPowerReferences()}
    ${fields('01 / 획득 조건','운영 재화·보상 풀에는 자동 반영되지 않습니다.',
      select('획득 방식',root+'acquisition.type',r.acquisition.type,ACQUISITIONS)+field('구매 가격 · 코인',root+'acquisition.coinPrice',r.acquisition.coinPrice,{type:'number'})+
      field('획득 확률 · %',root+'acquisition.dropRate',r.acquisition.dropRate,{type:'number',step:'any'})+field('획득처와 조건',root+'acquisition.source',r.acquisition.source,{type:'textarea',max:500,wide:true}))}
    ${fields('02 / 개별 성장','확정 전 값은 비워 둘 수 있습니다.',Object.entries({maxLevel:'최대 레벨',hpPerLevel:'레벨당 체력',attackPerLevel:'레벨당 공격력',defensePerLevel:'레벨당 방어력'}).map(([k,label])=>field(label,root+'growth.'+k,r.growth[k],{type:'number',min:k==='maxLevel'?'1':'0'})).join(''))}
    <section class="mc-fields-section"><div class="mc-section-title"><h3>03 / 등급 공통 성장</h3><p>C → B → A → S → SS → SSS</p></div><div class="mc-rank-table">${data.document.settings.rankGrowth.map((row,i)=>`<div><b>${row.rank}</b>${field('최대 레벨',`settings.rankGrowth.${i}.maxLevel`,row.maxLevel,{type:'number',min:'1'})}${field('레벨당 코인',`settings.rankGrowth.${i}.coinPerLevel`,row.coinPerLevel,{type:'number'})}${field('레벨당 경험치',`settings.rankGrowth.${i}.expPerLevel`,row.expPerLevel,{type:'number'})}</div>`).join('')}</div></section>
    ${fields('04 / 공통 정책', '출시 시 반영할 조건을 기록합니다.',field('획득 정책', 'settings.acquisitionNotes',data.document.settings.acquisitionNotes,{type:'textarea',wide:true,max:4000})+field('성장 정책','settings.growthNotes',data.document.settings.growthNotes,{type:'textarea',wide:true,max:4000}))}
    </div></div>`;
}
function reviewEditor(){
  return `<div class="mc-review"><div class="mc-release-strip"><div><small>JOINT RELEASE</small><h3>V3 개편 + 용병 + 장비 강화</h3><p>운영 CMS에 등록 완료 · 게임 출시는 공동 업데이트로 진행</p></div><div><b>획득 OFF</b><b>편성 OFF</b><b>전투 OFF</b></div></div>
    ${fields('출시 메모','CMS 검수 상태와 최종 공동 출시 승인은 별도로 관리합니다.',field('출시 준비 사항','settings.releaseNotes',data.document.settings.releaseNotes,{type:'textarea',max:4000,wide:true}))}
    <div class="mc-section-title"><h3>등록 리소스 <span>43 원화 / 43 SD / 17 스킬 · 272 프레임</span></h3><p>원본 경로·해시를 보존하고 검수 화면으로 연결합니다.</p></div><div class="mc-resource-grid">${data.catalog.cards.map(c=>{const row=data.document.mercenaries.find(r=>r.code===c.code);return `<article><img src="${thumb(c.code)}" alt="" loading="lazy"><div><small>${c.code}</small><b>${esc(row.name)}</b><span>${esc(REVIEWS[row.review])}</span><div><a href="${asset(c.sourceArt)}" target="_blank" rel="noopener">원화 ↗</a><a href="${asset(c.battleSprite)}" target="_blank" rel="noopener">SD ↗</a></div><details><summary>원본 해시</summary><p>ART ${esc(c.sourceArtSha256)}<br>SD ${esc(c.battleSpriteSha256)}</p></details></div></article>`;}).join('')}</div>
    <div class="mc-section-title"><h3>최근 저장 기록</h3></div><div class="mc-audit">${data.audit.map(a=>`<p><b>r${a.revision}</b><span>${a.action==='REGISTER'?'전체 항목 최초 등록':'CMS 설정 저장'}</span><span>관리자 #${a.actor_id}</span><time>${date(a.created_at)}</time></p>`).join('')}</div></div>`;
}
function render(){
  if(!section)return;
  section.innerHTML=`<div class="mc-console"><header class="mc-header"><div><small>SOOPKETMON / PROJECT V</small><h2>용병 운영실<span>CMS</span></h2><p>캐릭터, 스킬, 성장 설계를 한곳에서 관리합니다.</p></div><div class="mc-header-counts"><span><b>43</b> MERCENARIES</span><span><b>17</b> SKILLS</span><em>CMS LIVE</em></div></header>
    <div class="mc-status"><span class="mc-status-dot"></span><p>운영 DB 저장 · 게임 출시는 V3 공동 업데이트 대기</p>${data?`<small>r${data.revision} · ${date(data.updatedAt)}</small>`:''}</div>
    <div class="mc-tabs" role="tablist" aria-label="용병 관리 분류">${Object.entries(tabs).map(([k,v])=>`<button role="tab" aria-selected="${tab===k}" data-tab="${k}">${v}</button>`).join('')}</div>
    <p class="mc-notice ${error?'is-error':''}" role="status" aria-live="polite">${esc(notice||'초안 저장 후 다른 기기에서도 이어서 관리할 수 있습니다.')}</p>
    ${data?`<fieldset class="mc-content" ${busy?'disabled':''}>${({roster:rosterEditor,skills:skillEditor,assignments:assignmentEditor,draw:()=>drawEditor.html(data.document),economy:economyEditor,review:reviewEditor}[tab])()}</fieldset>`:'<div class="mc-empty">'+(busy?'운영 데이터를 불러오는 중…':'관리자 로그인 후 다시 불러와 주세요.')+'</div>'}
    <footer class="mc-savebar" ${tab==='draw'?'hidden':''}><span data-save-label>${dirty?'● 저장하지 않은 변경 있음':data?`✓ r${data.revision} 저장 상태`:'연결 대기'}</span><div><button data-export ${!data?'disabled':''}>JSON 내보내기</button><button data-reload ${busy?'disabled':''}>다시 불러오기</button><button class="mc-primary" data-save ${!data||busy||!dirty?'disabled':''}>${busy?'처리 중…':pending?'저장 결과 재확인':'운영 CMS 저장'}</button></div></footer></div>`;
  section.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;history.replaceState(null,'',tab==='draw'?'#mercenaries/draw':'#mercenaries');render();});
  section.querySelectorAll('[data-code]').forEach(b=>b.onclick=()=>{selected=b.dataset.code;render();});
  section.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{skill=b.dataset.skill;render();});
  $('[data-search]')?.addEventListener('input',e=>{query=e.target.value;$('[data-roster-list]').innerHTML=list();section.querySelectorAll('[data-code]').forEach(b=>b.onclick=()=>{selected=b.dataset.code;render();});});
  section.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('input',()=>{
    const parts=input.dataset.field.split('.');let ref=data.document;for(const key of parts.slice(0,-1))ref=ref[key];const key=parts.at(-1);
    ref[key]=input.type==='number'?(input.value===''?null:Number(input.value)):key==='rank'?(input.value||null):input.value;
    markDirty();
    if(key==='role'){const role=data.catalog.roles[ref.role];if(!role.positions.includes(ref.position))ref.position=role.positions[0];if(!role.targets.includes(ref.skillTarget))ref.skillTarget=role.targets[0];render();}
    if(key==='rank')render();
  }));
  section.querySelectorAll('[data-assign]').forEach(input=>input.onchange=()=>{const row=data.document.assignments.find(a=>a.code===selected);row.skillIds=input.checked?[...row.skillIds,input.dataset.assign]:row.skillIds.filter(id=>id!==input.dataset.assign);markDirty();render();});
  $('[data-save]').onclick=save;$('[data-reload]').onclick=()=>{if(!dirty||confirm('저장하지 않은 변경을 버리고 운영 DB에서 다시 불러올까요?'))void load();};
  $('[data-export]').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({revision:data.revision,document:data.document},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`mercenary-cms-r${data.revision}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  drawEditor.mount($('[data-draw-root]'));
}
function markDirty(){dirty=true;pending=null;const label=$('[data-save-label]');if(label)label.textContent='● 저장하지 않은 변경 있음';const saveButton=$('[data-save]');if(saveButton){saveButton.disabled=false;saveButton.textContent='운영 CMS 저장';}}
async function load(){if(busy)return;busy=true;error=false;notice='운영 CMS를 불러오고 있습니다.';render();try{data=await api();dirty=false;pending=null;notice='43종 용병·17종 스킬을 불러왔습니다. 저장한 설정은 운영 DB에 보존됩니다.';}catch(e){error=true;notice=e.name==='AbortError'?'불러오기가 지연됩니다. 다시 불러오기를 눌러 주세요.':e.message;}finally{busy=false;render();}}
async function save(){
  if(busy||!data||!dirty)return;
  if([...section.querySelectorAll('input,select,textarea')].some(input=>!input.reportValidity()))return;
  try{validateMercenaryCms(data.document,data.catalog);}catch(e){error=true;notice=e.message;render();return;}
  pending??={requestId:crypto.randomUUID(),expectedRevision:data.revision,document:structuredClone(data.document)};
  busy=true;error=false;notice='변경 내용을 운영 DB에 저장하고 있습니다.';render();
  try{data=await api({method:'PATCH',body:JSON.stringify(pending)});dirty=false;pending=null;notice=`저장 완료 · r${data.revision}. CMS 초안이 보존되었습니다.`;}
  catch(e){error=true;notice=e.name==='AbortError'?'응답 확인이 지연됩니다. 저장 결과 재확인을 누르면 같은 요청을 안전하게 확인합니다.':e.message;if(e.status&&e.status<500)pending=null;}
  finally{busy=false;render();}
}
function activate(){if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==section);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));const title=document.getElementById('pageTitle');if(title)title.textContent='용병 운영실';history.replaceState(null,'',tab==='draw'?'#mercenaries/draw':'#mercenaries');if(!data&&!busy)void load();}
function start(){
  const nav=document.getElementById('nav'),main=document.getElementById('cms')||document.querySelector('main'),badge=document.getElementById('roleBadge');if(!nav||!main||!badge)return;
  button=document.createElement('button');button.type='button';button.dataset.view='mercenaries';button.textContent='용병 관리';button.hidden=true;nav.insertBefore(button,nav.querySelector('[data-view="settings"]'));
  section=document.createElement('section');section.id='view-mercenaries';section.className='view mc-admin';section.hidden=true;main.append(section);render();
  button.addEventListener('click',event=>{event.stopImmediatePropagation();activate();},true);
  let deepLinkHandled=false;
  const roleChanged=()=>{button.hidden=badge.textContent.trim()!=='OWNER';if(!button.hidden&&['#mercenaries','#mercenaries/draw'].includes(location.hash)&&!deepLinkHandled){deepLinkHandled=true;if(location.hash.endsWith('/draw'))tab='draw';activate();}if(button.hidden){section.hidden=true;data=null;dirty=false;pending=null;drawEditor.reset();render();}};
  new MutationObserver(roleChanged).observe(badge,{childList:true,subtree:true,characterData:true});roleChanged();
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
