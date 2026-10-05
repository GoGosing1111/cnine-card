import {MERCENARY_LEVEL_RULES as RULES,LEVEL_BONUS_TYPES,levelProgress,mercenaryLevelState,planMercenaryTraining,planMercenaryBreakthrough} from '../../shared/mercenary-level-v1.mjs?v=20261005';
import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
import {createLevelClient} from './client.mjs?v=20261005';
import {levelDemo} from './demo.mjs?v=20261005';
const preview=new URL(location.href).searchParams.get('preview')==='1',app=document.querySelector('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n===null||n===undefined?'미정':Number(n).toLocaleString('ko-KR');
let account,selected,quantities={},notice='',isError=false,busy=false,client,allowOverflow=false,qaResult='success',pending=false;
const target=()=>account.cards.find(c=>c.code===selected);
const progress=()=>levelProgress(account.policy,target().growth);
const materials=()=>Object.entries(quantities).filter(([,n])=>n!==0).map(([code,quantity])=>({code,quantity}));
function training(){if(!materials().length)return null;try{return planMercenaryTraining({policy:account.policy,state:target().growth,target:target(),materials:materials(),owned:account.cards,catalog:account.cards});}catch(e){return {error:e.message};}}
function effect(m){return m.bonus.type&&m.bonus.value!==null?`${LEVEL_BONUS_TYPES[m.bonus.type]} ${fmt(m.bonus.value)}${m.bonus.type==='SKILL_COOLDOWN_TURNS'?'턴':'%'}`:'효과 미정';}
function render(){
 app.setAttribute('aria-busy',String(busy));document.querySelector('#mode').textContent=preview?'검수 모드 · 실제 소모 없음':account?.enabled?'성장실':'운영 실행 OFF';
 if(!account?.cards.length){app.innerHTML=`<div class="heading"><div><span class="eyebrow">MERCENARY DEVELOPMENT</span><h1>용병 성장실</h1></div></div><p class="empty" role="status">${esc(notice||'보유한 용병이 없습니다. 용병 도감에서 보유 카드를 확인하세요.')}</p>`;return;}
 const c=target(),s=progress(),p=account.policy;
 app.innerHTML=`<div class="heading"><div><span class="eyebrow">MERCENARY DEVELOPMENT / 01—20</span><h1>한계를 넘어, 다음 경지로.</h1></div><p>같은 등급의 용병 카드로 경험치를 채우고<br>네 번의 돌파로 새로운 힘을 해금하세요.</p></div>
 ${preview?'<div class="demo-note"><b>검수 전용 시뮬레이션</b> · 등급·수량·경험치·2배·50%·5%는 화면 검수용 예시입니다.<br>운영 수치는 미정이며, 실제 계정 조회·재료 소모·전투 반영은 없습니다.</div>':!account.enabled?'<div class="demo-note">용병 레벨 활성화 준비 중 · 실행 OFF<br>경험치·동일 카드 배수·돌파 확률과 효과가 확정된 후 공개됩니다.</div>':''}
 <div class="chamber" id="workbench"><section class="portrait" aria-label="성장 대상"><img src="/${esc(c.sourceArt)}" alt="${esc(c.name)} 원화"><div class="portrait-head"><span class="rank">${esc(c.rank)}<small>${preview?' 예시':''}</small></span><small>GROWTH CHAMBER<br>MAX LEVEL / 20</small></div><div class="portrait-body"><small>${esc(c.code)} / SELECTED MERCENARY</small><div class="identity"><div><h2>${esc(c.name)}</h2><p class="muted">${s.complete?'최종 돌파 완료':s.breakthroughReady?'돌파 준비 완료':'다음 경지를 준비하고 있습니다.'}</p></div><div class="level-num"><span>Lv.</span>${s.level}</div></div><div class="xp-meta"><span>${s.complete?'최종 경지':`경험치 ${fmt(s.experience)} / ${fmt(s.requiredXp)}`}</span><b>${s.percent===null?'미정':s.percent.toFixed(1)+'%'}</b></div><div class="xp-track" role="progressbar" aria-label="현재 레벨 경험치" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.percent??0}"><span style="width:${s.percent??0}%"></span></div><label><span class="muted">성장 대상 선택</span><select id="target" ${busy||pending?'disabled':''}>${account.cards.map(t=>`<option value="${t.code}" ${t.code===c.code?'selected':''}>${esc(t.rank)} · ${esc(t.name)} · Lv.${t.growth.level}</option>`).join('')}</select></label></div></section>
 <section class="work"><div class="section-head"><h2>네 번의 돌파</h2><small>성공할 때마다 효과 해금</small></div><div class="milestones">${p.milestones.map((m,i)=>`<article class="milestone ${s.breakthroughMask&(1<<i)?'unlocked':s.level===m.level?'current':''}"><small>BREAK ${String(i+1).padStart(2,'0')}</small><b>Lv.${m.level}</b><p>${esc(effect(m))}</p><em>${s.breakthroughMask&(1<<i)?'해금 완료':m.successChancePpm===null?'성공 확률 미정':`성공 ${fmt(m.successChancePpm/10000)}%`}</em></article>`).join('')}</div>
 <div class="section-head"><h2>경험치 재료 선택</h2><small>${esc(c.rank)} 등급만 표시 · 기본 1장 보호</small></div><div class="materials">${account.cards.filter(m=>m.rank===c.rank).map(m=>`<article class="material ${m.code===c.code?'same':''}"><img src="/${esc(m.sourceArt)}" alt="" loading="lazy"><div><h3>${esc(m.name)}</h3><span class="tag">${m.code===c.code?`동일 용병 ×${p.sameCardMultiplier??'미정'}`:'같은 등급 용병'}</span><p>사용 가능 ${fmt(m.duplicates)}장 · 1장 보호</p><label>소모 <input aria-label="${esc(m.name)} 소모 수량" data-quantity="${m.code}" type="number" min="0" max="${Math.min(100,m.duplicates)}" step="1" value="${quantities[m.code]||0}" ${busy||pending||!account.enabled||s.complete||s.breakthroughReady?'disabled':''}> 장</label></div></article>`).join('')}</div>
 <div id="calculation"></div><div class="actions"><button id="train" class="primary">경험치 전수</button><button id="breakthrough">돌파 시도</button></div>${pending?`<div class="actions"><button id="recover" ${busy?'disabled':''}>이전 요청 결과 확인</button></div>`:''}<div id="notice" class="result ${isError?'error':''}" role="status" aria-live="polite">${esc(notice||'같은 용병 카드는 더 많은 경험치를 제공합니다.')}</div>
 ${preview?`<div class="qa"><p>검수 도구 · 구간 이동은 시뮬레이션 상태만 바꿉니다.</p>${[5,10,15,20].map(l=>`<button data-jump="${l}" ${busy?'disabled':''}>Lv.${l} 준비</button>`).join('')}<label class="muted">돌파 결과 <select id="qa-result"><option value="success" ${qaResult==='success'?'selected':''}>성공 예시</option><option value="failure" ${qaResult==='failure'?'selected':''}>실패 예시</option></select></label><button id="reset">초기화</button></div>`:''}
 <details class="rules"><summary>성장 · 돌파 규칙</summary><ul><li>일반 멤버 카드는 재료로 사용할 수 없습니다. 용병마다 기본 보유 1장은 남깁니다.</li><li>일반 레벨의 남는 경험치는 다음 레벨로 이월합니다. 돌파 구간을 넘는 경험치는 동의 후 소멸합니다.</li><li>Lv.5·10·15·20에서 경험치가 100%가 되면 돌파할 수 있습니다.</li><li>실패: 현재 레벨 유지, 해당 레벨 경험치 0%. 기존 돌파 효과는 유지됩니다.</li><li>성공: 해당 효과 해금 후 다음 레벨로 이동. Lv.20은 최종 돌파 후에도 20레벨입니다.</li><li>돌파 효과끼리는 종류별 합산합니다. 코인·마스터의 별 추가 비용은 없습니다.</li></ul></details></section></div>`;
 document.querySelector('#target').onchange=e=>{selected=e.target.value;quantities={};allowOverflow=false;notice='';render();};
 document.querySelectorAll('[data-quantity]').forEach(el=>el.oninput=()=>{quantities[el.dataset.quantity]=Number(el.value);allowOverflow=false;renderCalculation();});
 document.querySelector('#train').onclick=()=>void act('TRAIN');document.querySelector('#breakthrough').onclick=()=>void act('BREAKTHROUGH');
 document.querySelector('#recover')?.addEventListener('click',()=>void recover());
 document.querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>{const level=Number(el.dataset.jump);c.growth={level,experience:p.levels[level-1].requiredXp,breakthroughMask:(1<<RULES.milestones.indexOf(level))-1,revision:c.growth.revision+1};quantities={};allowOverflow=false;notice=`Lv.${level} 돌파 준비 상태입니다. 성공·실패를 확인하세요.`;render();});
 document.querySelector('#qa-result')?.addEventListener('change',e=>qaResult=e.target.value);
 document.querySelector('#reset')?.addEventListener('click',()=>{account=levelDemo();selected=account.cards[0].code;quantities={};notice='검수 상태를 초기화했습니다.';isError=false;render();});
 renderCalculation();
}
function renderCalculation(){
 const plan=training(),s=progress(),blocked=busy||pending||!account.enabled;
 document.querySelector('#calculation').innerHTML=`<div class="calc"><span>획득 예정 경험치</span><strong>${plan&&!plan.error?`+${fmt(plan.xp)}`:'—'}</strong><p class="muted">${plan?.error?esc(plan.error):plan?`Lv.${plan.before.level} → Lv.${plan.after.level} · 적용 ${fmt(plan.appliedXp)} EXP${plan.breakthroughReady?' · 돌파 준비 완료':''}`:'소모할 중복 카드 수량을 선택하세요.'}</p>${plan?.overflowXp?`<label><input id="overflow" type="checkbox" ${allowOverflow?'checked':''} ${blocked?'disabled':''}><span>돌파 구간을 넘는 ${fmt(plan.overflowXp)} EXP가 사라지는 것에 동의합니다. 재료 수량을 줄일 수도 있습니다.</span></label>`:''}</div>`;
 document.querySelector('#overflow')?.addEventListener('change',e=>{allowOverflow=e.target.checked;renderCalculation();});
 document.querySelector('#train').disabled=blocked||!plan||Boolean(plan.error)||Boolean(plan.overflowXp&&!allowOverflow)||s.complete||s.breakthroughReady;
 document.querySelector('#breakthrough').disabled=blocked||!s.breakthroughReady;document.querySelector('#breakthrough').textContent=s.complete?'최종 돌파 완료':s.breakthroughReady?`Lv.${s.level} 돌파 시도`:'돌파 대기';
}
function describe(result,action){return action==='TRAIN'?`경험치 전수 완료 · +${fmt(result.appliedXp)} EXP · Lv.${result.after.level}${result.overflowXp?` · 초과 ${fmt(result.overflowXp)} EXP 소멸`:''}`:result.success?`Lv.${result.before.level} 돌파 성공 · ${effect(result.milestone)} 해금${result.complete?' · 최종 돌파 완료':` · Lv.${result.after.level}`}`:`돌파 실패 · Lv.${result.before.level} 유지 · 경험치 0%로 재시작합니다. 기존 효과는 유지됩니다.`;}
async function applyReceipt(r){if(!r||r.status!=='COMPLETED'){notice='이전 요청의 처리를 확인하고 있습니다.';return;}notice=describe(r.result,r.action);account=await client.state();client.acknowledge(r.requestId);pending=false;quantities={};allowOverflow=false;}
async function recover(){if(busy)return;busy=true;isError=false;render();try{await applyReceipt(await client.run(null,null,{submit:account.enabled}));}catch(e){notice=e.message;isError=true;pending=Boolean(client.pending());}finally{busy=false;render();}}
async function act(action){
 if(busy||!account.enabled||pending)return;const body={mercenaryCode:selected,revision:target().growth.revision,...(action==='TRAIN'?{materials:materials(),allowOverflow}:{})};busy=true;isError=false;render();
 try{
  if(preview){const result=action==='TRAIN'?planMercenaryTraining({policy:account.policy,state:target().growth,target:target(),materials:body.materials,owned:account.cards,catalog:account.cards}):planMercenaryBreakthrough({policy:account.policy,state:target().growth,roll:qaResult==='success'?0:999999});target().growth=result.after;for(const m of result.consumed||[]){const row=account.cards.find(c=>c.code===m.code);row.totalCopies-=m.quantity;row.duplicates-=m.quantity;}quantities={};allowOverflow=false;notice=describe(result,action);}
  else await applyReceipt(await client.run(action==='TRAIN'?'train':'breakthrough',body));
 }catch(e){notice=e.message;isError=true;if(client)pending=Boolean(client.pending());}finally{busy=false;render();if(action==='BREAKTHROUGH'&&!isError){app.classList.remove('success');void app.offsetWidth;app.classList.add('success');}}
}
async function start(){
 try{account=preview?levelDemo():await jointAccountRequest('mercenaries/v3/leveling/state');selected=account.cards[0]?.code;if(!preview){client=createLevelClient({accountId:account.userId});pending=Boolean(client.pending());if(pending)await applyReceipt(await client.run(null,null,{submit:false}));}render();}
 catch(e){notice=e.message;isError=true;render();}
}
void start();
