const $=id=>document.getElementById(id),get=async p=>{const r=await fetch(p);if(!r.ok)throw Error(p);return r.json();};
const m=await get('manifest.json'),weapons={bongsoon:'GATLING',joeun:'WHIP',diim:'SCYTHE',claws:'CLAWS',dagger:'DAGGER'};
let selected='bongsoon';
function show(slug){const c=m.characters.find(c=>c.slug===slug),p=c.combat;selected=slug;window.BloodmoonSelectedSlug=slug;
 for(const b of document.querySelectorAll('[data-character]'))b.setAttribute('aria-pressed',String(b.dataset.character===slug));
 $('stage-name').textContent=c.name;$('name').textContent=c.name;$('weapon').textContent=weapons[slug];$('portrait').src=c.sourceArt.path;$('portrait').alt=c.name+' 승인 원화';$('source-link').href=c.sourceArt.path;
 $('skill-name').textContent=c.skillName;$('skill-description').textContent=p.skill.effect;
 const stats=[['기본 전투력',p.basePower.toLocaleString('ko-KR')],['스킬 배율',(p.skill.balance.damageRatio*100).toLocaleString('ko-KR')+'%'],['재사용 / 비용',p.skill.balance.cooldownTurns+'행동 / '+p.skill.balance.cost],['자연 행동 속도',p.speedScale+'배'],['카드 1행동당 추가 행동',p.actionCredit+'회']];
 $('stats').replaceChildren(...stats.flatMap(([a,b])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=a;dd.textContent=b;return [dt,dd];}));
}
for(const c of m.characters){const b=document.createElement('button');b.className='character';b.dataset.character=c.slug;b.setAttribute('aria-pressed',String(c.slug===selected));const img=document.createElement('img');img.src=c.sourceArt.path;img.alt='';const text=document.createElement('span');text.textContent=c.name;const sub=document.createElement('small');sub.textContent=weapons[c.slug];text.append(sub);b.append(img,text);b.onclick=async()=>{show(c.slug);try{await window.BloodmoonPreview?.select(c.slug);}catch(e){$('health').textContent='리소스 준비 실패: '+e.message;}};$('characters').append(b);}
show(selected);
try{const r=await get('qa/balance-report.json');for(const c of m.characters){const p=c.combat,result=r.pvp.find(x=>x.slug===c.slug&&x.opponent==='V-977'),tr=document.createElement('tr');for(const value of [c.name,(p.skill.balance.damageRatio*100).toLocaleString('ko-KR')+'%',p.skill.balance.cooldownTurns+'행동',p.speedScale+'배',(result.winRate*100).toFixed(1)+'%']){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('balance-rows').append(tr);}$('balance-note').textContent=`동일 조건 PVP ${r.totalPvp.toLocaleString('ko-KR')}회 · PVE ${r.totalPve}회 검증. 표의 수치는 바토리 상대 시뮬레이션 승률이며 실제 이용자 승률을 보장하지 않습니다.`;}catch{$('balance-note').textContent='밸런스 비교 보고서를 준비하고 있습니다.';}
