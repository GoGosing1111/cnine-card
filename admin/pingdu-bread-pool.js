import {byId as $, element, request} from '/events/pingdu-bread/client.js';
import {breadOdds, percent, percentUnits, scaleFixedRates} from '/shared/pingdu-bread-odds.mjs';

const categoryNames = {MATERIAL:'재료',GIFT_BOX:'선물상자',PACK:'팩',CUBE:'큐브',EVENT:'이벤트',ENTRY_TICKET:'입장권',REROLL:'재뽑기권',SKILL_CHIP:'스킬칩',OTHER:'기타'};
const labelOf = category => categoryNames[category] || category;
export function bindRewardEditor(onSaved, reload) {
  let catalog = [], matches = [], revision, saving = false;
  const rows = $('poolRows');
  const allRows = () => [...rows.children];
  function readRow(row) {
    const field = name => row.querySelector('[data-'+name+']').value;
    const entry = {code:row.dataset.code, quantity:Number(field('quantity')), mode:field('mode')};
    if (entry.mode === 'auto') entry.weight = Number(field('rate'));
    else entry.fixedUnits = percentUnits(field('rate'));
    return entry;
  }
  function recalculate() {
    const elements = allRows();
    $('scaleOdds').hidden = !elements.length || elements.some(row => row.querySelector('[data-mode]').value !== 'fixed');
    try {
      const applied = breadOdds(elements.map(readRow));
      elements.forEach((row,i) => { row.querySelector('output').textContent = percent(applied[i].units)+'%'; });
      $('total').textContent = '적용 확률 합계 100% · 보상 '+applied.length+'개'; $('total').classList.remove('invalid');
      $('savePool').disabled = saving; return applied;
    } catch (error) {
      for (const row of elements) row.querySelector('output').textContent = '—';
      $('total').textContent = error.message; $('total').classList.add('invalid'); $('savePool').disabled = true;
      return null;
    }
  }
  function makeRow(item, entry={}) {
    const row = element('div',null,'reward-row'); row.dataset.code = item.code;
    const heading = element('div',null,'reward-name');
    const thumb = element('img'); thumb.alt=''; thumb.loading='lazy'; thumb.src=item.image;
    const title = element('div'); title.append(element('strong',item.name),element('small',item.code));
    heading.append(thumb,title); row.append(heading);
    function field(name,input,key) {
      const label = element('label',null,'reward-field'), text = element('span',name);
      input.dataset[key] = ''; input.setAttribute('aria-label',item.name+' '+name);
      label.append(text,input); row.append(label); return text;
    }
    const quantity = element('input'); quantity.type='number'; quantity.min='1'; quantity.step='1';
    quantity.max=String(Number.MAX_SAFE_INTEGER); quantity.required=true; quantity.value=entry.quantity ?? 1;
    field('수량',quantity,'quantity');
    const mode = element('select'); mode.append(new Option('자동 배분','auto'),new Option('고정 확률','fixed'));
    mode.value=entry.mode || (entry.chance != null ? 'fixed' : 'auto'); field('배분 방식',mode,'mode');
    const rate=element('input'); rate.type='number'; rate.required=true;
    const rateCaption=field('가중치',rate,'rate');
    function rateMode(value) {
      const fixed=mode.value==='fixed'; rateCaption.textContent=fixed?'고정 확률(%)':'가중치';
      rate.setAttribute('aria-label',item.name+' '+rateCaption.textContent);
      rate.min=fixed?'0':'1'; rate.step=fixed?'0.000001':'1'; rate.max=fixed?'100':'100000000'; rate.value=value;
    }
    rateMode(mode.value==='auto' ? entry.weight ?? 1 : percent(entry.fixedUnits ?? entry.units ?? entry.chance * 10000));
    const odds=element('div',null,'odds-value');odds.append(element('small','적용 확률'),element('output','—'));row.append(odds);
    const remove=element('button','제거'); remove.type='button'; remove.setAttribute('aria-label',item.name+' 제거');
    remove.onclick=()=>{ row.remove(); recalculate(); };row.append(remove);
    mode.onchange=()=>{
      const shown=row.querySelector('output').textContent.replace('%','');
      rateMode(mode.value==='auto' ? 1 : Number.isFinite(Number(shown)) ? shown : 0);
      recalculate();
    };
    return row;
  }
  function filter() {
    const term=$('itemSearch').value.trim().toLocaleLowerCase('ko-KR'), category=$('category').value;
    matches=catalog.filter(item=>(!category||item.category===category)&&[item.name,item.code,item.rarity].some(value=>String(value).toLocaleLowerCase('ko-KR').includes(term)));
    const options=matches.map(item=>{
      const option=new Option(item.name+' · '+item.code+(item.active?'':' · 비활성'),item.code);
      option.disabled=!item.active; return option;
    });
    $('itemOption').replaceChildren(...options);
    const eligible=matches.filter(item=>item.active);
    if (eligible.length) $('itemOption').value=eligible[0].code;
    $('addItem').disabled=$('addAll').disabled=!eligible.length;
    $('matches').textContent='검색 결과 '+matches.length+'종 · 지급 가능 '+eligible.length+'종';
  }
  $('itemSearch').oninput=filter; $('category').onchange=filter;
  $('addItem').onclick=()=>{const item=matches.find(i=>i.code===$('itemOption').value && i.active); if(item){ const row=makeRow(item); rows.append(row);recalculate(); row.querySelector('input').focus(); }};
  $('addAll').onclick=()=>{
    const used=new Set(allRows().map(row=>row.dataset.code));
    rows.append(...matches.filter(item=>item.active&&!used.has(item.code)).map(item=>makeRow(item)));
    recalculate();
  };
  rows.addEventListener('input',recalculate);
  $('scaleOdds').onclick=()=>{
    try {
      const list=allRows(), normalized=scaleFixedRates(list.map(row=>percentUnits(row.querySelector('[data-rate]').value)));
      list.forEach((row,i)=>{row.querySelector('[data-rate]').value=percent(normalized[i]);});
      recalculate();
    } catch(error) { $('poolNote').textContent=error.message; }
  };
  $('reloadPool').onclick=async()=>{
    $('reloadPool').disabled=true;
    try{await reload();$('poolNote').textContent='저장된 보상표를 불러왔습니다.';}
    catch(error){$('poolNote').textContent=error.message;}
    finally{$('reloadPool').disabled=false;}
  };
  $('poolForm').onsubmit=async event=>{
    event.preventDefault(); if(saving)return;
    const items=recalculate(); if(!items)return;
    saving=true; $('savePool').disabled=true; $('poolForm').inert=true;
    try {
      const next=await request('pool',{admin:true,body:{revision,items}});
      revision=next.revision; onSaved(next); $('poolNote').textContent='아이템 설정을 저장했습니다. 이후 지급분부터 적용됩니다.';
    } catch(error){$('poolNote').textContent=error.message;}
    finally{saving=false;$('poolForm').inert=false;recalculate();}
  };
  return (options,config)=>{
    catalog=options;revision=config.revision;
    const byCode=new Map(options.map(item=>[item.code,item]));
    const categories=[...new Set(options.map(item=>item.category))].sort((a,b)=>labelOf(a).localeCompare(labelOf(b),'ko'));
    $('category').replaceChildren(new Option('전체 분류',''),...categories.map(code=>new Option(labelOf(code),code)));
    filter();
    rows.replaceChildren(...config.items.map(entry=>makeRow(byCode.get(entry.code)||entry,entry)));
    recalculate();
  };
}
