import {battlePlan,formatRewardAmount,rewardText,stages} from '../../shared/field-operation-battle-plan.mjs';
import {mountScene} from './scene.mjs';
const $=id=>document.getElementById(id);
const catalog={yard:{name:'폐차장',zone:'압축 설비 구역',mission:'유압 프레임 회수',description:'회수기를 돌파하고 아틀라스의 관절을 해체해 고철과 프레임을 확보합니다.'},escort:{name:'호송작전',zone:'협곡 검문로',mission:'특수 코어 수송',description:'습격 지휘관을 격파하고 수송차와 화물을 검문소까지 지켜 운임을 정산합니다.'}};
const session=window.frameElement?.fieldOperation,mode=session?.mode,abort=new AbortController();
let scene=null,step=null,activeCard=-1;
window.addEventListener('pagehide',()=>abort.abort(),{once:true});
$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{$('full').title='현재 창 전체를 사용 중입니다.'}};
document.addEventListener('fullscreenchange',()=>{const t=document.fullscreenElement?'전체 화면 종료':'전체 화면';$('full').setAttribute('aria-label',t);$('full').title=t;$('full').querySelector('span').textContent=t;});
const el=(tag,txt,cl)=>{const e=document.createElement(tag);if(txt!=null)e.textContent=txt;if(cl)e.className=cl;return e};
const compact=n=>new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1}).format(n);
function meters(yard){
 for(const [k,col] of yard?[['대상 내구','#ffc283'],['격파','#98dfc9']]:[['차체','#ffc283'],['화물','#98dfc9']]){
  const wrap=el('div',null,'meter'),line=el('div'),bar=el('i');wrap.style.setProperty('--color',col);line.append(el('small',k),el('b','—'));bar.append(el('em'));wrap.append(line,bar);$('meters').append(wrap);
 }
}
function roster(cards){for(const c of cards){const li=el('li',null,'member'),img=el('img'),box=el('div'),bar=el('span',null,'card-hp');img.alt='';img.src=new URL(c.projectVBattleArt?.primaryUrl||c.image||c.image_url||'/assets/ui/project-v/fallback/unassigned-card-unit-sd-v1.png',location.origin+'/').href;bar.append(el('i'));box.append(el('b',c.memberName||c.title||c.name),bar,el('small','100%'));li.append(img,box);$('roster').append(li);}}
function draw(s){
 const vals=mode==='yard'?[[s.targetHp+'%',s.targetHp],[s.defeated+' / '+s.total,100*s.defeated/s.total]]:[[s.hull+'%',s.hull],[s.cargo+'%',s.cargo]];
 [...$('meters').children].forEach((e,i)=>{e.querySelector('b').textContent=vals[i][0];e.querySelector('em').style.width=vals[i][1]+'%';});
 [...$('roster').children].forEach((e,i)=>{const hp=s.hp[i];e.classList.toggle('active',activeCard===i);e.querySelector('small').textContent=hp+'%';e.querySelector('i').style.width=hp+'%';});
 [...$('progress').querySelectorAll('span')].forEach((e,i)=>{e.className=i===s.stage?'current':i<s.stage?'past':'';});
}
function settlement(f,s){
 const yard=mode==='yard',reason=({VEHICLE_DESTROYED:'차체 파괴',CARGO_LOST:'화물 전량 손실',MONSTER_SURVIVED:'제한 내 격파 실패',ELIMINATION:'호위대 전투 불능',ALL_DEFEATED:'전투원 전멸'})[s.reason]||'전투 목표 미달';
 const rows=[['코인',formatRewardAmount(s.coin)],['마별',formatRewardAmount(s.masterStars)]];
 if(yard)rows.push(['격파',s.defeated+' / '+s.total],['고철',s.scrap+'개'],['유압 프레임',s.frames+'개']);
 else rows.push(['잔여 차체',s.hull+'%'],['화물 보존',s.cargo+'%'+(s.won?' · '+s.grade+'등급':'')]);
 if(!s.won)rows.unshift(['종료 사유',reason]);
 $('receiptMode').textContent=catalog[mode].name+' / '+f.tier.name;$('stamp').textContent=s.won?'완료':'실패';$('receiptTitle').textContent=yard?'부품 회수 정산':'화물 인계 정산';
 for(const [key,value] of rows){const row=el('div');if(key==='코인'||key==='마별')row.className='currency';row.append(el('dt',key),el('dd',value));$('receiptRows').append(row);}
 $('replay').onclick=()=>session.close();$('receipt').hidden=false;document.body.classList.add('done');document.body.dataset.outcome=s.won?'won':'lost';
}
async function show(f){
 const c=catalog[mode],yard=mode==='yard';document.body.dataset.mode=mode;$('location').textContent=c.name+' / '+f.tier.name;$('field').hidden=false;$('dock').hidden=false;document.title=c.name+' · '+f.tier.name+' | 리버스콜';
 $('sector').textContent=c.zone+' / '+f.tier.name;$('mission').textContent=c.mission;$('formation').textContent='출전 전투력 '+compact(f.deckPower)+' · PvE 덱 '+f.payload.battleV2.teams.A.cards.length+'장';
 for(const [i,label] of stages[mode].entries()){if(i)$('progress').append(el('i'));$('progress').append(el('span',label));}
 roster(f.payload.battleV2.teams.A.cards);meters(yard);
 const steps=battlePlan(mode,f);draw(steps[0].state);
 scene=await mountScene(f,mode,$('renderer'),$('labels'),abort.signal);$('loading').hidden=true;
 for(const next of steps){
  abort.signal.throwIfAborted();step=next;if(Number.isInteger(step.card))activeCard=step.card;
  if(step.kind==='settle'){activeCard=-1;settlement(f,f.settlement);}
  if(step.line){$('headline').textContent=step.line;$('detail').textContent=step.hint||'';}
  draw(step.state);await scene.play(step);
 }

}
try {
 if(!session)throw Error('게임 안에서 작전에 입장하세요.');
 const result=await session.result;
 try { await show(result); } catch(error) {
  if(abort.signal.aborted)throw error;
  console.warn('[V3] 전장 표시를 종료하고 저장된 정산을 표시합니다.',error);
  $('field').hidden=false;$('loading').hidden=true;$('headline').textContent='작전 결과';
  if($('receipt').hidden)settlement(result,result.settlement);
 }
} catch(error){if(!abort.signal.aborted){$('field').hidden=false;$('loading').hidden=false;$('loading').textContent=error.message;}}
