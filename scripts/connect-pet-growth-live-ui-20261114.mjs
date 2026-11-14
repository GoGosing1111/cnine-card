import fs from 'node:fs/promises';
const edit=async(file,fn)=>{const old=await fs.readFile(file,'utf8'),next=fn(old);if(old===next)throw Error('No change: '+file);await fs.writeFile(file,next);};
await edit('js/pet-growth-window-v2.mjs',s=>s.replace("const statIcon=",`const money=n=>{const value=BigInt(n||0);return value>=1000000000000n?(Number(value/10000000000n)/100).toLocaleString('ko-KR')+'조':value.toLocaleString('ko-KR');};
const traitDetail=(trait,policy)=>trait.activated===false?'아직 부여되지 않았습니다. 특성 주사위로 개방하세요.':PET_TRAITS[trait.id].description+(policy.values?' +'+policy.values[trait.id][trait.grade]+'%':'');
const statIcon=`).replace("return '<div class=\"pg-roll-actions\"><div>'+icon(PET_GROWTH_IMAGES[kind])",`if(typeof cost==='object'){
   const enough=BigInt(state.wallet.coin)>=BigInt(cost.coin)&&state.wallet.masterStars>=cost.masterStars;
   return '<div class="pg-roll-actions pg-currency-cost"><div>'+icon(PET_GROWTH_IMAGES[kind])+'<span><b>1회 코인 '+money(cost.coin)+'</b><small>마스터의 별 '+cost.masterStars.toLocaleString('ko-KR')+'개</small></span></div><button type="button" class="pg-button" data-pg-action="roll" data-kind="'+kind+'" '+(locked||!enough?'disabled':'')+'>'+title+' 굴리기</button></div><p class="pg-wallet">보유 코인 '+money(state.wallet.coin)+' · 마스터의 별 '+state.wallet.masterStars.toLocaleString('ko-KR')+'개</p>';
  }
  return '<div class="pg-roll-actions"><div>'+icon(PET_GROWTH_IMAGES[kind])`).replace('선택 시 주사위 추가 소모 없음','결과 선택 시 추가 비용 없음').replace("esc(trait.description)","esc(traitDetail(petRow.trait,adapter.policy))").replace("PET_TRAITS[v.id].name", "v.activated===false?'미개방':PET_TRAITS[v.id].name").replace("if(!error.code){", "if(!error.code||error.retryable){").replace("'네 능력치는", "'네 능력치는")
 .replace("+badge(petRow.stats[key])+'<div", "+badge(petRow.stats[key])+(adapter.policy.values?'<small class=\"pg-stat-value\">+'+adapter.policy.values[key][petRow.stats[key]]+'%</small>':'')+'<div")
 .replace("if(pending&&pendingPet?.petCode!==pet.code){", "if(pending&&!pendingPet){root.innerHTML=head+'<section class=\"pg-empty\"><h3>결과를 선택할 펫을 현재 보유하지 않았습니다</h3><p>기존 결과를 유지하면 남아 있는 선택을 종료합니다. 사용한 비용은 반환되지 않습니다.</p><button class=\"pg-button\" data-pg-action=\"keep\" '+(busy?'disabled':'')+'>기존 결과 유지</button></section>';return;}\n  if(pending&&pendingPet?.petCode!==pet.code){"));
await edit('js/pet-codex-growth-v3.mjs',s=>s.replace("import {mountPetGrowth}","import {mountPetGrowthExtras} from './pet-growth-extras-v2.mjs';\nimport {mountPetGrowth}")
 .replace("view=null,locked=false", "view=null,extras=null,locked=false")
 .replace('<main data-pc-detail></main>','<main data-pc-detail></main><section data-pc-extras></section>')
 .replace("locked=value;for", "locked=value;extras?.lock(value);for")
 .replace("view?.dispose();selected=code;", "extras?.dispose();extras=null;view?.dispose();selected=code;")
 .replace("onLockChange:lock});", "onLockChange:lock});\n  if(growth.live)extras=mountPetGrowthExtras($('[data-pc-extras]'),{pet:model.cards.find(row=>row.code===code),model,request,onBusy:value=>{lock(value);$('[data-pc-detail]').inert=value;}});")
 .replace("model=next;", "if(growth.live){const portraits=await fetch('/assets/ui/pets/rework-20261114/codex-v3/pets.json').then(r=>r.json());for(const row of next.cards)Object.assign(row,portraits[row.code]||{});}\n   model=next;")
 .replace("view?.dispose();root.removeEventListener", "view?.dispose();extras?.dispose();root.removeEventListener"));
await edit('pet-codex/app.mjs',s=>s.replace('20261105-pet-modes','20261114-growth-live').replace("mountPetEquipment(document.getElementById('pet-codex'),{codex:true});",`import {createLivePetGrowthAdapter} from '/js/pet-growth-live-adapter-v2.mjs';
const adapter=createLivePetGrowthAdapter();
mountPetEquipment(document.getElementById('pet-codex'),{codex:true,growth:{layout:'unified',live:true,adapter,async createEffectPreview(host,options){const {createPetEffectPreview}=await import('/preview/pet-rework-20261114/fx-preview.bundle.mjs');return createPetEffectPreview(host,options);}}});`));
await edit('pet-codex/index.html',s=>s.replaceAll('20261105-pet-modes','20261114-growth-live'));
await edit('shared/pet-growth-v2.mjs',s=>s.replace('황금빛 축복으로 대상 콘텐츠의 보상을 지원합니다.','PvE 전투 콘텐츠의 코인 보상을 높입니다.'));
await edit('tests/pet-growth-live-20261114.test.mjs',s=>s.replace("target:'ALL_ALLIES',buffs:[{type:'ATTACK_PERCENT',percent:50}]},growth", "target:'ALL_ALLIES',notes:'',buffs:[{type:'ATTACK_PERCENT',percent:50}]},growth"));
await edit('functions/_battle_v2_preview.js',s=>s.replace("if(event)emitTimeline(timeline,clock,'PET_OPENING_BUFF'", "if(event?.petTrait?.id==='HUNTER'){event.petTrait.targetIds=(side==='A'?b:a).filter(actor=>actor.isBoss&&actor.alive&&actor.hp>0).map(actor=>actor.id);event.petTrait.active=event.petTrait.active&&event.petTrait.targetIds.length>0;}\n      if(event)emitTimeline(timeline,clock,'PET_OPENING_BUFF'"));
console.log('Connected live pet UI, price display and combat start targets.');
