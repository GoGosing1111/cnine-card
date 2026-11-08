import {HEIR_TITLE} from '../shared/season-s1-title.mjs';
import {ART} from '../shared/season-s1.mjs';
import {SEASON_LABELS} from './season-s1-labels-v3.mjs';
let root=null,data=null,mode='PVE',selected=new URLSearchParams(location.search).get('recipe')==='COMMON_TITLE'?'COMMON_TITLE':'COMMON_CORE',busy=false,controller=null,uid=0,epoch=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v||0).toLocaleString('ko-KR');
const UI='/assets/ui/season-s1-immortal-king/v3/';
const crestArt=r=>r?.output===HEIR_TITLE.code?HEIR_TITLE.art:r?.art;
const icon=(name,large=false)=>'<span class="s1-art '+(large?'s1-art-large ':'')+(name===HEIR_TITLE.art?'s1-heir-icon':'')+'"><span class="s1-orbit"></span><img src="'+(name===HEIR_TITLE.art?HEIR_TITLE.image:ART+name+'-v3.webp')+'" alt="" width="384" height="384"><span class="s1-spark s1-spark-a"></span><span class="s1-spark s1-spark-b"></span><span class="s1-spark s1-spark-c"></span></span>';
const lettering=(name,text,cls='')=>'<img class="s1-lettering '+cls+'" src="'+UI+'type-'+name+'.webp" alt="'+esc(text)+'">';
const label=(text,cls='',key=text)=>{const a=SEASON_LABELS[key];return a?'<img class="s1-label '+cls+'" src="'+UI+a.file+'" alt="'+esc(text)+'" width="'+a.width+'" height="'+a.height+'">':esc(text);};
function titleName(code, text) {
  if (code !== HEIR_TITLE.code) return label(text);
  return '<span class="s1-heir-insignia"><img class="s1-heir-plate" src="' + HEIR_TITLE.plate +
    '" alt="' + esc(HEIR_TITLE.name) + '" width="1040" height="308"></span>';
}
const challengeIcon=(art,done)=>'<span class="s1-challenge-icon"><img src="'+UI+'challenge-'+art+'.webp" alt="" width="192" height="192">'+(done?'<img class="s1-achieved" src="'+UI+'achieved.svg" alt="완료">':'<span class="s1-sr-only">미달성</span>')+'</span>';
const key=()=> 'cnine-s1-pending:'+uid;
const pending=()=>{try{return JSON.parse(sessionStorage.getItem(key())||'null');}catch{return null;}};
async function request(path,body){
 if(typeof window.apiRequest==='function')return window.apiRequest(path,body?{method:'POST',body:JSON.stringify(body)}:{signal:controller?.signal},{ttl:0,microcache:false,replaceInflight:true});
 const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(localStorage.getItem('cnine_card_api_token')||'')},body:body?JSON.stringify(body):undefined,signal:body?undefined:controller?.signal});
 const json=await r.json();if(!r.ok)throw Object.assign(Error(json.error||'요청을 처리하지 못했습니다.'),{status:r.status,code:json.code});return json;
}
const notice=(message,error=false)=>{const el=root?.querySelector('[data-s1-notice]');if(el){el.textContent=message;el.dataset.error=String(error);}};
function remaining(t){if(!t.end)return '시작 일정 추후 공개';const days=Math.max(0,Math.ceil((t.end-data.serverNow)/86400000));return t.phase==='ACTIVE'?days+'일 남음':t.phase==='CRAFTING'?'제작 유예 기간':t.phase==='CLOSED'?'시즌 종료':'개막 준비';}
function modeButtons(){return '<div class="s1-modes" role="group" aria-label="시즌 선택">'+['PVE','PVP'].map(m=>'<button type="button" class="s1-mode" data-s1-mode="'+m+'" aria-pressed="'+(mode===m)+'">'+icon(m==='PVE'?'tower-sigil':'duel-sigil')+'<span class="s1-mode-title">'+lettering(m.toLowerCase(),m)+'<b>'+label(m==='PVE'?'공략과 돌파':'참여와 경쟁')+'</b></span><strong>Lv.'+data.tracks[m].level+'</strong></button>').join('')+'</div>';}
function sharedReward(){
 const c=data.common,p=c.pacing,step=data.season.runeEvery,max=data.season.runeLimit,full=c.owned>=max;
 const target=p?.nextAuto??(Math.floor(c.activities/step)+1)*step,next=Math.max(0,target-c.activities);
 const goal=full?step:Math.min(step,Math.max(0,c.activities-(target-step)));
 const count=full?'룬 5개 수집 완료':next?'다음 룬까지 '+next+'회':'다음 룬까지 참여 '+Math.max(0,p.nextAutoDay-p.playDays)+'일';
 const pace=p?'<p class="s1-pace-line" data-s1-rune-today>오늘 공용 참여 <b>'+p.today+' / '+data.season.dailyRuneBattles+'회</b> · 누적 참여 '+p.playDays+'일</p>':'';
 const schedule=p?'<details class="s1-rune-dates"><summary>룬별 보장·제작 조건</summary><table><thead><tr><th>룬</th><th>자동 지급</th><th>직접 제작</th></tr></thead><tbody>'+data.season.runeCraftDays.map((day,i)=>'<tr><td>'+(i+1)+'번째</td><td>'+(i+1)*step+'회 · 최소 '+(i+1)*step/data.season.dailyRuneBattles+'일</td><td>참여 '+day+'일</td></tr>').join('')+'</tbody></table><p>참여일은 정상 정산한 날짜입니다. 미리 제작한 차수는 자동 지급에서 건너뜁니다.</p></details>':'';
 return `<section class="s1-panel s1-shared" aria-label="통합 룬 보상"><div class="s1-shared-copy"><small>SEASON 01 &nbsp; / &nbsp; PVE + PVP</small><h2>${label('불멸왕 룬')}</h2><p>두 모드 합산 <b>${step}회마다 다음 차수의 룬</b>을 보장합니다.</p>${pace}<strong data-s1-rune-progress>${count} · 누적 ${n(c.activities)}회</strong><div class="s1-progress" role="progressbar" aria-label="공용 룬 참여" aria-valuenow="${goal}" aria-valuemin="0" aria-valuemax="${step}"><i style="width:${goal/step*100}%"></i></div>${schedule}</div><div class="s1-sigils" aria-label="공용 룬 보유 ${c.owned}개 / 5개">${Array.from({length:max},(_,i)=>`<span class="${i<c.owned?'is-lit':''}" aria-label="${i+1}번째 룬 ${i<c.owned?'보유':'미획득'}">${icon('immortal-seal')}<small>${['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ'][i]}</small></span>`).join('')}</div></section>`;
}
function todayProgress(track){
 if(!track.today)return '';
 const s=data.season,d=track.today;
 if(track.phase!=='ACTIVE'){const text=track.phase==='CRAFTING'?'제작 유예 · 전투 집계 종료':track.phase==='CLOSED'?'시즌 종료':'개막 전 · 전투 집계 전';return '<div class="s1-daily-progress" data-s1-track-today><b>'+mode+' · '+text+'</b><span>이 모드 참여 '+track.playDays+'일</span></div>';}
 return `<div class="s1-daily-progress" data-s1-track-today><b>${mode} · 시즌 ${track.day}일차</b><span>오늘 보상 ${d.events}/${s.dailyBattles}회</span><span>참여 XP ${d.xp}/${s.dailyXp}</span><span>가루 ${d.dust}/${s.dailyDust}</span><small>시즌 누적 ${n(track.events)}회 · 참여 ${track.playDays}일 · 보상은 한국 자정 초기화</small></div>`;
}
function progressPanel(t){const xp=t.level===50?100:t.xpInLevel,available=Math.max(0,t.xpCap-t.participation);return `<div class="s1-progress-panel s1-panel"><div class="s1-level"><small>${label('시즌 레벨')}</small><strong>${t.level}</strong><span>/ 50</span></div><div class="s1-progress-body"><div class="s1-progress-top"><b>${t.level===50?'불멸의 경지':'다음 레벨까지 '+(100-xp)+' XP'}</b><span>${n(t.xp)} / 4,900 XP</span></div><div class="s1-progress" role="progressbar" aria-label="현재 레벨 경험치" aria-valuenow="${xp}" aria-valuemin="0" aria-valuemax="100"><i style="width:${xp}%"></i></div><div class="s1-progress-details"><span>참여 ${n(t.participation)} / 3,500</span><span>미션 ${n(t.achievementXp)} / 1,400</span><span>주차 한도 잔여 ${n(available)} XP</span></div>${todayProgress(t)}</div><button class="s1-button s1-small" data-s1-refresh>${lettering('refresh','새로고침')}</button></div>`;}
function missionPanel(t){
 const missions=data.achievements[mode],completed=missions.filter(([id,,,counter,goal])=>t.achievements.includes(id)||(t.counts[counter]||0)>=goal).length;
 const rules=mode==='PVP'?'일반 랭크전과 듀오랭크에 직접 출전하면 승패·티어와 관계없이 정산한 경기마다 1회로 합산합니다.':'정상 정산한 출정은 모두 집계합니다. 무한의탑 전용 미션은 시즌 1회입니다.';
 const rows=missions.map(([id,name,reward,counter,goal,art])=>{
  const actual=t.counts[counter]||0,progress=Math.min(goal,actual),paid=t.achievements.includes(id),done=paid||progress>=goal;
  const extra=counter!=='ALL'&&actual>goal?' · 누적 '+n(actual)+'회':'';
  const detail=done&&!paid?'달성 · 보상 대기':reward+' XP';
  return `<div class="s1-achievement ${done?'is-done':''}" data-mission="${id}">${challengeIcon(art,done)}<b>${label(name)}</b><small><strong>${progress} / ${goal}${extra}</strong>${detail}</small></div>`;
 }).join('');
 const pending=missions.some(([id,,,counter,goal])=>!t.achievements.includes(id)&&(t.counts[counter]||0)>=goal);
 return `<section class="s1-panel s1-achievements"><div class="s1-section-heading"><h2>${lettering('challenges','왕좌를 향한 도전')}</h2><span>${completed} / ${missions.length}</span></div><p class="s1-mission-note">${rules} 하루 ${data.season.dailyBattles}회 이후에도 횟수가 오릅니다.${pending?' 달성한 미션 보상은 이 모드의 다음 보상 대상 전투에서 한 번 지급합니다.':''}</p>${rows}</section>`;
}
function selectMode(next){
 if(next===mode||!data?.tracks[next]||!root?.isConnected)return;
 mode=next;const t=data.tracks[mode];root.dataset.mode=mode;
 root.querySelectorAll("[data-s1-mode]").forEach(el=>el.setAttribute("aria-pressed",String(el.dataset.s1Mode===mode)));
 root.querySelector(".s1-deadline").textContent=remaining(t);
 root.querySelector(".s1-progress-panel").outerHTML=progressPanel(t);
 root.querySelector(".s1-achievements").outerHTML=missionPanel(t);
 root.querySelector("[data-s1-refresh]").addEventListener("click",refresh);
}
function render(){
 if(!root?.isConnected||!data)return;
 if(!data.enabled){root.innerHTML='<div class="s1-empty"><h2>S1 불멸의 왕</h2><p>시즌 개막을 준비하고 있습니다.</p></div>';return;}
 const t=data.tracks[mode],c=data.common,recipes=data.recipes,r=recipes.find(x=>x.id===selected)||recipes[0];selected=r.id;
 const phase=c.modes.length>0,locked=c.level<r.level,used=c.crafts[r.id]||0,core=r.id==='COMMON_CORE',upgrade=r.id==='COMMON_UPGRADE',copies=data.runes.catalog.filter(x=>x.owned),targets=copies.filter(x=>!x.upgraded);
 const lacks=c.balances.DUST<r.dust||c.balances.TOKEN<r.tokens,done=used>=r.limit||(core&&c.owned===data.season.runeLimit);
 const pace=c.pacing;
 const wait=core&&pace&&pace.playDays<pace.nextCraftDay?'공용 참여 '+pace.nextCraftDay+'일에 해금':r.output===HEIR_TITLE.code&&pace&&!pace.titleReady?'시즌 '+data.season.titleSeasonDay+'일차 · 참여 '+data.season.titlePlayDays+'일 필요':'';
 const reason=!phase?'제작 기간이 아닙니다':done?'시즌 제작 완료':locked?'Lv.'+r.level+'에 해금':wait?wait:upgrade&&!targets.length?'강화할 룬이 없습니다':lacks?'제작 재료가 부족합니다':'확정 제작';

 root.dataset.mode=mode;
 root.innerHTML=`<header class="s1-hero"><img class="s1-hero-scene" src="${UI}throne-panorama.webp" width="1920" height="640" alt="불멸왕의 왕좌와 영혼불"><div class="s1-hero-copy"><h1><img class="s1-logo" src="${UI}season-logo.webp" width="1200" height="600" alt="SEASON 01 불멸의 왕"></h1><p>${label('왕좌를 향한 기록')}</p><span class="s1-deadline">${remaining(t)}</span></div></header>
 ${modeButtons()}${progressPanel(t)}
 ${sharedReward()}<div class="s1-main"><section class="s1-forge s1-panel" aria-label="시즌 제작소"><div class="s1-section-heading"><h2>${lettering('forge','불멸왕의 제작소')}</h2><span>공용 제작 · 성공률 100%</span></div>
 <div class="s1-recipe-list" role="group" aria-label="제작 아이템 선택">${recipes.map(x=>`<button type="button" class="s1-recipe" aria-pressed="${r.id===x.id}" data-s1-recipe="${x.id}">${icon(crestArt(x))}<span>Lv.${x.level}</span><b>${label(x.name,'',x.name+'|compact')}</b>${c.level<x.level?'<em>미해금</em>':''}</button>`).join('')}</div>
 <div class="s1-workbench"><div class="s1-display ${Object.values(data.owned).some(v=>v.kind==='AURA')?'s1-awakened':''}">${icon(crestArt(r),true)}<span class="s1-display-caption">S1 · PVE·PVP 공용</span></div><div class="s1-craft-info"><small>${r.output===HEIR_TITLE.code?'한 모드에서 달성':'두 시즌 중 높은 레벨 기준'} · Lv.${r.level}</small><h3>${titleName(r.output,r.name)}</h3><p>${esc(r.description)}</p>${pace&&r.output===HEIR_TITLE.code?'<p class="s1-pace-line">한 모드에서 Lv.50 · 실제 참여 '+data.season.titlePlayDays+'일 · 시즌 '+data.season.titleSeasonDay+'일차부터</p>':pace&&core&&pace.nextCraftDay?'<p class="s1-pace-line">다음 룬 제작: 공용 참여 '+pace.playDays+' / '+pace.nextCraftDay+'일</p>':''}<div class="s1-material-cost">${costRow('DUST',r.dust)}${costRow('TOKEN',r.tokens)}</div>
 ${r.output==='SELECT_SCROLL'?'<label class="s1-choice">받을 주문서<select id="s1-scroll-choice"><option value="WEAPON_ENHANCEMENT_SCROLL">무기 강화주문서</option><option value="ARMOR_ENHANCEMENT_SCROLL">방어구 강화주문서</option></select></label>':''}
 ${upgrade&&targets.length?`<label class="s1-choice">강화할 룬<select id="s1-copy-choice">${targets.map(x=>`<option value="${esc(x.code)}">불멸왕 룬 · ${x.copy}번${Object.values(data.runes.placements).includes(x.code)?' (장비에 삽입 중)':''}</option>`).join('')}</select></label>`:''}
 <div class="s1-craft-limit">${core?'참여 보상 포함 보유 '+c.owned+' / 5개':upgrade?'강화 완료 '+c.upgraded+' / 5개':'시즌 제작 '+used+' / '+r.limit+'회'}</div><button class="s1-button s1-primary" data-s1-craft ${busy||reason!=='확정 제작'?'disabled':''}>${reason==='확정 제작'?lettering('craft',reason):reason==='시즌 제작 완료'?lettering('complete',reason):reason}</button></div></div>
 <div class="s1-feedback" data-s1-notice role="status" aria-live="polite"></div>${pending()?'<button class="s1-button" data-s1-retry>이전 제작 요청 확인</button>':''}</section>
 <aside class="s1-side"><section class="s1-panel s1-owned"><div class="s1-section-heading"><h2>${lettering('legacy','왕의 유산')}</h2><span>영구 보유</span></div><div class="s1-owned-core">${icon('immortal-seal')}<div><b>${label('불멸왕 룬')}</b><p>보유 ${c.owned} / 5 · 착용 ${data.runes.activeCount} / 5</p></div></div><p class="s1-muted">룬 1개당 PVE 공격력·랭크전 최대 체력 +8%, 강화 시 +10%. 다섯 부위에 착용하면 최대 +50%입니다.</p><a class="s1-rune-entry" href="/?screen=character">장비 아이콘에서 룬 장착</a><p class="s1-equipped">현재 PVE 공격력 +${data.runes.bonuses.PVE.attackBp/100}% · 랭크전 최대 체력 +${data.runes.bonuses.PVP.hpBp/100}%</p>${Object.entries(data.owned).filter(([,v])=>['AURA','TITLE'].includes(v.kind)).map(([code,v])=>code===HEIR_TITLE.code?'<a class="s1-heir-entry" href="/?screen=character&amp;tab=title">'+titleName(code,v.name)+'<span>칭호 보관함에서 장착</span></a>':'<p class="s1-collected">'+icon(v.art||'immortal-seal')+label(v.name)+'</p>').join('')}</section>
 ${missionPanel(t)}</aside></div>
 <section class="s1-panel s1-materials"><div class="s1-section-heading"><h2>${lettering('materials','시즌 재료')}</h2><span>공용 제작소 보유 재료</span></div><div class="s1-material-grid">${data.materials.map(m=>`<div class="s1-material">${icon(m.art)}<div><b>${label(m.name)}</b><strong>${n(c.balances[m.code])}</strong></div>${m.mode?`<button class="s1-button s1-small" data-s1-exchange="${m.code}" ${!c.balances[m.code]||busy?'disabled':''}>제작 증표 교환</button>`:''}</div>`).join('')}</div><p class="s1-muted">두 시즌에서 모은 가루와 제작 증표를 함께 씁니다. 특수 재료 1개는 증표 1개로 교환할 수 있습니다.</p></section>
 <footer class="s1-footer"><p>시즌별 종료 후 7일간 해당 재료 사용 가능 · 완성품 영구 보유</p>${Object.values(data.tracks).some(v=>v.phase==='CLOSED'&&!v.converted)?'<button class="s1-button" data-s1-settle>만료된 재료를 기록의 가루로 전환</button>':''}<span>기록의 가루 ${n(data.legacy)} · 일반 재료 1:1 / 특수 재료 1:25</span></footer>`;
 bindActions();
}
function costRow(code,amount){
 if(!amount)return '';const m=data.materials.find(x=>x.code===code),have=data.common.balances[code];
 return '<div class="'+(have<amount?'s1-short':'')+'">'+icon(m.art)+'<span>'+label(m.name)+'</span><b>'+n(have)+' / '+n(amount)+'</b></div>';
}
async function refresh(entry){
 const turn=epoch;
 try{
  const early=entry?await entry.result:null;
  if(turn!==epoch||!root?.isConnected)return;
  const usable=early&&entry.current();
  if(usable&&early.error)throw early.error;
  const next=usable?early.data:await request('season/status');
  if(turn!==epoch||!root?.isConnected)return;
  data=next;render();
 }catch(e){
  if(turn!==epoch||!root?.isConnected||e.name==='AbortError')return;
  if(!data)root.innerHTML='<div class="s1-empty"><h2>시즌 정보를 불러오지 못했습니다</h2><p>'+esc(e.message)+'</p><button class="s1-button" data-s1-refresh>다시 시도</button></div>';
  bindActions();notice(e.message,true);
 }
}
async function mutate(action,payload={},retry=false){
 if(busy)return;
 let record=pending();
 if(record&&!retry){notice('완료 여부를 확인할 이전 요청이 있습니다. 이전 요청 확인을 눌러 주세요.',true);return;}
 if(!record){record={action,body:{...payload,requestId:crypto.randomUUID()}};sessionStorage.setItem(key(),JSON.stringify(record));}
 busy=true;render();const turn=epoch,requestKey=key();
 try{const result=await request('season/'+record.action,record.body);sessionStorage.removeItem(requestKey);if(turn!==epoch||!root?.isConnected)return;busy=false;await refresh();notice(result.replayed?'이미 완료된 요청을 확인했습니다.':'정상적으로 반영했습니다.');if(result.reward){window.dispatchEvent(new CustomEvent('cnine:player-updated',{detail:{source:'season-craft'}}));reveal(result.reward);}}
 catch(e){const rejected=[400,403,404].includes(e.status)||e.code==='SEASON_CONDITION'||e.code==='SEASON_REQUEST_CONFLICT';if(rejected)sessionStorage.removeItem(requestKey);if(turn!==epoch||!root?.isConnected)return;busy=false;await refresh();notice(e.message+(rejected?'':' 이전 요청 확인으로 안전하게 다시 확인할 수 있습니다.'),true);}
}
function reveal(reward){
 const recipe=data.recipes.find(r=>r.output===reward.code||reward.code.endsWith('_SCROLL')&&r.output==='SELECT_SCROLL'),art=crestArt(recipe)||'immortal-seal';
 const dialog=document.createElement('dialog');dialog.className='s1-reveal';dialog.setAttribute('aria-label','제작 완료');dialog.innerHTML='<div class="s1-reveal-rays"></div><div class="s1-reveal-title">'+lettering('complete','제작 완료')+'</div>'+icon(art,true)+'<h2>'+titleName(reward.code,reward.name)+'</h2><strong>'+(reward.upgraded?'강화 완료':'제작 완료')+'</strong><p>'+(reward.external?'인벤토리에 지급되었습니다.':reward.code.endsWith('_S1_TITLE')?'칭호 메뉴에서 장착할 수 있습니다.':'왕의 유산에 추가되었습니다.')+'</p>'+(reward.code===HEIR_TITLE.code?'<a class="s1-heir-entry" href="/?screen=character&amp;tab=title">칭호 보관함에서 장착</a>':'')+'<button class="s1-button">'+lettering('confirm','확인')+'</button>';
 document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
function bindActions(){
 root?.querySelectorAll('[data-s1-mode]').forEach(el=>el.onclick=()=>selectMode(el.dataset.s1Mode));
 root?.querySelectorAll('[data-s1-recipe]').forEach(el=>el.onclick=()=>{selected=el.dataset.s1Recipe;render();});
 root?.querySelector('[data-s1-refresh]')?.addEventListener('click',refresh);
 root?.querySelector('[data-s1-craft]')?.addEventListener('click',()=>mutate('craft',{recipeId:selected,choice:root.querySelector('#s1-scroll-choice')?.value,copyId:root.querySelector('#s1-copy-choice')?.value}));
 root?.querySelectorAll('[data-s1-exchange]').forEach(el=>el.onclick=()=>mutate('exchange',{code:el.dataset.s1Exchange}));
 root?.querySelector('[data-s1-retry]')?.addEventListener('click',()=>mutate('',{},true));
 root?.querySelector('[data-s1-settle]')?.addEventListener('click',()=>mutate('settle'));
}
function dispose(){epoch++;controller?.abort();controller=null;root=null;data=null;busy=false;document.querySelectorAll('.s1-reveal').forEach(d=>{d.close();d.remove();});}
window.SeasonS1=Object.freeze({
 view(user){uid=Number(user?.serverUserId||user?.id||0);return '<section id="seasonS1Root" class="s1" aria-label="불멸의 왕 시즌"><div class="s1-empty">왕좌의 기록을 불러오는 중…</div></section>';},
 bind(entry){dispose();root=document.getElementById('seasonS1Root');controller=entry?.controller||new AbortController();void refresh(entry);},
 refresh,dispose
});
window.addEventListener('cnine:route-will-change',dispose);

