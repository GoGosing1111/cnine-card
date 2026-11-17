import {POLISH_OPTIONS} from './equipment-polish-v1.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons=['attack','critical-chance','critical-damage','boss-damage','penetration'];
const fmt=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2});
export function polishDisplay(item){
  const state=item?.polish;
  if(!state)return {label:'연마 정보 없음',text:'연마 정보를 다시 불러오세요.',options:[],known:false};
  const successes=state.attempts,rolls=state.rolls??successes;
  const options=POLISH_OPTIONS.flatMap((option,i)=>state.values[i]>0?[{...option,icon:icons[i],level:state.levels[i],value:fmt.format(state.values[i])}]:[]);
  const label=successes>0?'연마 '+fmt.format(successes)+'회':rolls>0?'연마 성공 0회':'미연마';
  const text=(successes>0?'연마 성공 '+fmt.format(successes)+'회':label)+(rolls?' · 총 시도 '+fmt.format(rolls)+'회':'')+
    (options.length?' · '+options.map(o=>o.name+' +'+o.value+o.unit).join(' · '):'');
  return {label,text,options,successes,rolls,known:true};
}
export function polishMarkHtml(item,{successLabel=false}={}){
  const p=polishDisplay(item);
  return `<span class="eq-polish-mark ${p.successes?'is-polished':'is-unpolished'}" title="${escape(p.text)}"><span class="ep-icon" data-icon="polish-stone" aria-hidden="true"></span><span>${escape(successLabel&&p.successes?'연마 성공 '+fmt.format(p.successes)+'회':p.label)}</span></span>`;
}
export function polishDetailsHtml(item,{mercenary=false}={}){
  const p=polishDisplay(item);
  return `<section class="eq-polish-detail" aria-label="이 장비의 연마 상태"><header>${polishMarkHtml(item,{successLabel:true})}<small>${p.rolls?'총 시도 '+fmt.format(p.rolls)+'회':p.known?'연마 기록 없음':'확인 필요'}</small></header>${p.options.length?`<dl>${p.options.map(o=>`<div><dt><span class="ep-icon" data-icon="${o.icon}" aria-hidden="true"></span>${o.name}<small>${o.level}단계</small></dt><dd>+${o.value}${o.unit}</dd></div>`).join('')}</dl><p>${mercenary?'장착 용병의 PvE · PvP에 적용':'일반 장비는 PvE에 적용'} · 보스 피해는 보스 대상만 적용</p>`:`<p>${p.known?'아직 획득한 연마 옵션이 없습니다.':'연마 정보를 다시 불러오세요.'}</p>`}</section>`;
}
