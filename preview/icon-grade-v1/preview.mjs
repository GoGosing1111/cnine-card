import {ICON_EFFECTS,emptyIconDraft,validateIconDraft,iconReadiness} from '../../shared/icon-grade-v1.mjs';
import {createIconCard} from '../../js/icon-card-v1.mjs';
import {ICON_CARD_ROSTER} from '../../shared/icon-card-roster-v1.mjs';

const storageKey='soopketmon:icon-grade:preparation:v1';
const status=document.getElementById('draftStatus');
let draft=emptyIconDraft();
function notify(message,error=false){status.textContent=message;status.classList.toggle('error',error);}
try {
  const saved=localStorage.getItem(storageKey);
  if(saved){const checked=validateIconDraft(JSON.parse(saved));if(checked.ok){draft=checked.draft;notify('이 브라우저에 저장한 준비 초안을 불러왔습니다. 운영 반영 없음.');}else notify('이전 초안이 현재 준비 규칙과 달라 기본값으로 열었습니다.',true);}
} catch {notify('로컬 초안을 읽을 수 없어 기본값으로 열었습니다. 운영 데이터에는 영향이 없습니다.',true);}
const gallery=document.getElementById('rosterGallery');
const portrait=document.getElementById('cardPreview');
document.getElementById('rosterCount').textContent=`${ICON_CARD_ROSTER.length}종`;
function selectPortrait(card){
  portrait.replaceChildren(createIconCard(card));
  for(const button of gallery.querySelectorAll('button')){
    const selected=button.dataset.cardCode===card.code;
    button.setAttribute('aria-pressed',String(selected));
    button.textContent=selected?'상세 표시 중':'크게 보기 ↗';
  }
}
for(const card of ICON_CARD_ROSTER){
  const item=document.createElement('article');item.className='roster-item';
  item.append(createIconCard({...card,lazy:true}));
  const button=document.createElement('button');button.type='button';button.className='roster-select';
  button.dataset.cardCode=card.code;button.setAttribute('aria-label',`${card.name} 크게 보기`);button.setAttribute('aria-controls','cardPreview');
  button.addEventListener('click',()=>{selectPortrait(card);portrait.scrollIntoView({block:'center',behavior:'instant'});});
  item.append(button);gallery.append(item);
}
const requestedCard=new URLSearchParams(location.search).get('card');
selectPortrait(ICON_CARD_ROSTER.find(card=>card.code===requestedCard)||ICON_CARD_ROSTER[0]);
const fields=document.getElementById('effectFields');
for(const [index,effect] of ICON_EFFECTS.entries()){
  const row=document.createElement('div');row.className='effect-row';
  // Only static catalog text goes through HTML; saved values are input.value.
  row.innerHTML=`<span class="effect-num">${String(index+1).padStart(2,'0')}</span><div><div class="effect-heading"><label for="effect-${effect.code}">${effect.name}</label><small>${effect.status==='PROPOSED'?'신규 초안':'기존'}</small></div><div class="effect-input"><input id="effect-${effect.code}" name="${effect.code}" type="number" step="0.1" min="${effect.min}" max="${effect.max}" placeholder="수치 미정" aria-describedby="hint-${effect.code}"><span>${effect.unit}</span></div></div><p id="hint-${effect.code}">${effect.description}</p>`;
  row.querySelector('input').value=draft.effects.find(value=>value.code===effect.code).value??'';
  fields.append(row);
}
function collect(){return{...emptyIconDraft(),effects:ICON_EFFECTS.map(effect=>{const field=document.getElementById(`effect-${effect.code}`);return{code:effect.code,value:field.validity.badInput?NaN:field.value.trim()===''?null:Number(field.value)};})};}
function updateCount(){const checked=validateIconDraft(collect());document.getElementById('configuredCount').textContent=checked.ok?`${iconReadiness(checked.draft).configuredEffectCount} / 8 입력`:'입력값 확인';}
updateCount();fields.addEventListener('input',updateCount);
document.getElementById('effectForm').addEventListener('submit',event=>{
  event.preventDefault();const checked=validateIconDraft(collect());
  if(!checked.ok){notify(checked.errors.join(' '),true);return;}
  draft=checked.draft;
  try{localStorage.setItem(storageKey,JSON.stringify(draft));notify('초안 검증·로컬 저장 완료. 획득 및 실제 전투 적용은 계속 OFF입니다.');}
  catch{notify('검증은 통과했지만 브라우저 저장이 차단되었습니다. JSON 내보내기를 이용하세요.',true);}
});
document.getElementById('resetDraft').addEventListener('click',()=>{
  for(const input of fields.querySelectorAll('input'))input.value='';
  draft=emptyIconDraft();updateCount();notify('입력값을 초기화했습니다. 저장 버튼을 눌러야 저장된 초안도 갱신됩니다.');
});
document.getElementById('exportDraft').addEventListener('click',()=>{
  const checked=validateIconDraft(collect());if(!checked.ok){notify(checked.errors.join(' '),true);return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify(checked.draft,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='icon-grade-preparation-v1.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('준비 초안을 내보냈습니다. 운영 데이터에 자동 반영되지 않습니다.');
});
