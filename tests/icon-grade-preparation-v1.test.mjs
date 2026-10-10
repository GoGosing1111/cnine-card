import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';
import {ICON_GRADE,ICON_EFFECTS,isIconGrade,iconCardBasePower,uniqueEffectDefinitionsForGrade,emptyIconDraft,validateIconDraft,iconReadiness,iconAcquisitionAllowed} from '../shared/icon-grade-v1.mjs';
import {prepareIconGradeSettings,requireIconReleased} from '../functions/_icon_grade_preparation.js';
import {createIconCard} from '../js/icon-card-v1.mjs';
import {ICON_CARD_ROSTER} from '../shared/icon-card-roster-v1.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('ICON is a distinct streamer tier above ZENITH, fixed base 180,000 with undecided growth',()=>{
  assert.equal(ICON_GRADE.category,'STREAMER_CARD');assert.equal(ICON_GRADE.aboveGrade,'ZENITH');
  for(const grade of ['ICON','icon',' ICON ']){assert.equal(isIconGrade(grade),true);assert.equal(iconCardBasePower(grade),180000);}
  for(const grade of ['ZENITH','SUPERSTAR','FUR','SSS',null,{},'ICONS'])assert.equal(iconCardBasePower(grade),null);
  assert.equal(ICON_GRADE.enhancement.enabled,false);assert.equal(ICON_GRADE.deckLimit,2);
  assert.equal(ICON_GRADE.powerPolicy,'BASE_ONLY_GROWTH_UNDECIDED');
});

test('approved frame is byte-identical and keeps exact transparent portrait dimensions',()=>{
  const frame=readFileSync(new URL('../'+ICON_GRADE.frame.source,import.meta.url));
  assert.equal(createHash('sha256').update(frame).digest('hex').toUpperCase(),ICON_GRADE.frame.sha256);
  assert.equal(frame.subarray(1,4).toString(),'PNG');
  assert.equal(frame.readUInt32BE(16),1024);assert.equal(frame.readUInt32BE(20),1536);
  assert.equal(frame[25],6,'RGBA PNG');
  assert.equal(ICON_GRADE.frame.bottomCenterNameplate,false);assert.equal(ICON_GRADE.frame.dragonDesign,false);
  const manifest=JSON.parse(read('preview/icon-card-frame-v1/manifest.json'));
  assert.equal(manifest.sha256,ICON_GRADE.frame.sha256);assert.equal(manifest.status,'USER_APPROVED_20260920');
});

test('eight distinct effects are available only for ICON, existing grades retain four',()=>{
  assert.equal(new Set(ICON_EFFECTS.map(e=>e.code)).size,8);assert.equal(new Set(ICON_EFFECTS.map(e=>e.key)).size,8);
  assert.equal(uniqueEffectDefinitionsForGrade('ICON').length,8);
  for(const grade of ['C','FUR','ZENITH','SUPERSTAR','SSS','',undefined])assert.deepEqual(uniqueEffectDefinitionsForGrade(grade).map(e=>e.key),['attackPercent','defensePercent','hpPercent','speedPercent']);
  assert.equal(ICON_EFFECTS.filter(e=>e.status==='PROPOSED').length,4);
  assert.equal(Object.isFrozen(ICON_EFFECTS[0]),true);assert.equal(Object.isFrozen(ICON_GRADE.acquisition.methods),true);
});

test('empty draft retains undecided values, not invented zero or live effect balance',()=>{
  const draft=emptyIconDraft(),checked=validateIconDraft(draft);
  assert.equal(checked.ok,true);assert.deepEqual(checked.draft,draft);
  assert.equal(draft.effects.length,8);assert(draft.effects.every(effect=>effect.value===null));
  assert.equal(iconReadiness(draft).configuredEffectCount,0);
  draft.effects[0].value=12.5;assert.equal(emptyIconDraft().effects[0].value,null);
});

test('draft validation reorders the eight known effects deterministically without mutating input',()=>{
  const draft=emptyIconDraft();draft.effects.forEach((effect,index)=>effect.value=index+0.5);draft.effects.reverse();
  const before=JSON.stringify(draft),checked=prepareIconGradeSettings(draft);
  assert.deepEqual(checked.draft.effects.map(e=>e.code),ICON_EFFECTS.map(e=>e.code));
  assert.equal(JSON.stringify(draft),before);assert.equal(checked.readiness.configuredEffectCount,8);
  assert.equal(checked.readiness.ready,false);assert.equal(checked.policy.basePower,180000);
});

test('missing, duplicate, extra and unknown effects cannot be silently saved',()=>{
  for(const transform of [effects=>effects.slice(1),effects=>[...effects,effects[0]],effects=>[effects[0],...effects.slice(0,7)],effects=>effects.map((effect,i)=>i?effect:{code:'UNKNOWN',value:100})]){
    const draft=emptyIconDraft();draft.effects=transform(draft.effects);
    assert.equal(validateIconDraft(draft).ok,false);
    assert.throws(()=>prepareIconGradeSettings(draft),e=>e.code==='ICON_DRAFT_INVALID'&&e.status===400);
  }
});

test('reject nonfinite, string, boolean, undefined and out-of-range effect values; preserve null',()=>{
  for(const definition of ICON_EFFECTS){
    for(const invalid of [NaN,Infinity,-Infinity,'10',true,undefined,{},[],definition.min-0.1,definition.max+0.1]){
      const draft=emptyIconDraft();draft.effects.find(e=>e.code===definition.code).value=invalid;
      assert.equal(validateIconDraft(draft).ok,false,`${definition.code}:${String(invalid)}`);
    }
    for(const value of [null,0,definition.min,definition.max]){
      const draft=emptyIconDraft();draft.effects.find(e=>e.code===definition.code).value=value;
      assert.equal(validateIconDraft(draft).ok,true,`${definition.code}:${value}`);
    }
  }
});

test('grade, power, release flags, battle scopes and all acquisition proposals fail closed',()=>{
  for(const patch of [{grade:'ZENITH'},{basePower:180001},{basePower:'180000'},{version:2},{status:'RELEASED'},{releaseEnabled:true},{effectDesign:'APPROVED'},
    {scopes:{pve:true,pvp:false,captain:false}},{scopes:{pve:false,pvp:true,captain:false}},{scopes:{pve:false,pvp:false,captain:true}},
    {acquisition:{status:'UNDECIDED',enabled:true,methods:[],drawWeight:0}},
    {acquisition:{status:'UNDECIDED',enabled:false,methods:['GRANT'],drawWeight:0}},
    {acquisition:{status:'UNDECIDED',enabled:false,methods:[],drawWeight:1}}])assert.equal(validateIconDraft({...emptyIconDraft(),...patch}).ok,false);
  for(const input of [undefined,null,[],0,'ICON'])assert.equal(validateIconDraft(input).ok,false);
  for(const source of ['PACK','CHOICE_PACK','EVOLUTION','SHOP','REWARD','GRANT','OWNER'])assert.equal(iconAcquisitionAllowed({source,enabled:true}),false);
  assert.throws(()=>requireIconReleased({role:'OWNER',releaseEnabled:true}),e=>e.status===409&&e.code==='ICON_PREPARATION_ONLY');
});

test('unknown client properties cannot leak through the future CMS boundary',()=>{
  const draft=emptyIconDraft();draft.admin=true;draft.secret='not retained';draft.effects[0].enabled=true;
  const result=prepareIconGradeSettings(draft);
  assert.equal(result.draft.admin,undefined);assert.equal(result.draft.secret,undefined);assert.equal(result.draft.effects[0].enabled,undefined);
  assert.equal(result.readiness.acquisitionEnabled,false);assert.equal(result.readiness.battleEnabled,false);
});

test('card renderer places the name outside the frame and uses member source art, never SD',()=>{
  const doc={createElement(tag){
    return {tag,children:[],attributes:{},style:{},setAttribute(key,value){this.attributes[key]=value},append(...children){this.children.push(...children)}};
  }};
  const card=createIconCard({name:'<b>디임</b>',sourceArt:'assets/cards/ZENITH/20.jpg'},doc);
  assert.equal(card.tag,'figure');assert.equal(card.children[0].className,'card-frame grade-ICON');
  assert.deepEqual(card.children[0].children.map(c=>c.tag),['img','img']);
  assert.equal(card.children[1].tag,'figcaption');assert.equal(card.children[1].children[0].textContent,'<b>디임</b>');
  assert.match(card.children[0].children[0].src,/assets\/cards\/ZENITH\/20\.jpg$/);
  assert.match(card.children[0].children[1].src,/icon-streamer-frame-v1\.png$/);
  for(const path of ['https://untrusted.example/card.jpg','assets/ui/project-v/characters/sd.png','assets/cards/../../private.json','assets/cards/%2e%2e%2fprivate.jpg','javascript:alert(1)'])assert.throws(()=>createIconCard({name:'x',sourceArt:path},doc));
});

test('all seven user-supplied ICON photographs are preserved exactly and stay preview-only',async()=>{
  assert.deepEqual(ICON_CARD_ROSTER.map(card=>card.name),['디임','하이희야','나무늘봉순','오조은','오리꿍','강구열','아윤','제우스 철구']);
  assert.equal(new Set(ICON_CARD_ROSTER.map(card=>card.code)).size,8);
  assert.equal(new Set(ICON_CARD_ROSTER.map(card=>card.sourceArt)).size,8);
  for(const card of ICON_CARD_ROSTER){
    const data=readFileSync(new URL('../'+card.sourceArt,import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex').toUpperCase(),card.sourceSha256);
    const metadata=await sharp(data).metadata();
    assert.equal(metadata.width,card.sourceWidth);assert.equal(metadata.height,card.sourceHeight);
    assert.equal(card.sourceGrade,'ICON');assert.equal(card.releaseEnabled,false);assert.equal(Object.isFrozen(card),true);
    assert.match(card.sourceArt,/^assets\/cards\/ICON\//);
  }
  const preview=read('preview/icon-grade-v1/preview.mjs');
  assert.match(preview,/for\(const card of ICON_CARD_ROSTER\)/);
  assert.match(preview,/aria-pressed/);assert.doesNotMatch(preview,/assets\/cards\/ZENITH\/20\.jpg/);
});

test('Bongsoon uses the exact replacement JPEG while the previous approved photo is retained',()=>{
  const card=ICON_CARD_ROSTER.find(c=>c.code==='ICON-NAMUNEUL-BONGSOON');
  assert.equal(card.sourceArt,'assets/cards/ICON/namuneul-bongsoon-source-v2.jpg');
  assert.equal(card.sourceSha256,'B056757989C7F4E5FED48668AE4FA46C2276598B7FB6E8C1A655C265E8B2856E');
  assert.equal(card.portraitApproval.userRequest,'나무늘봉순 아이콘 이미지 이거로 바꿔');
  const previous=readFileSync(new URL('../'+card.portraitApproval.supersedes,import.meta.url));
  assert.equal(createHash('sha256').update(previous).digest('hex').toUpperCase(),'195B26B47922115D4B65E0D4A6B5B3DB35A1196488D1941C8981C6DE6D200BD6');
  assert.equal(card.releaseEnabled,false);
});

test('user ICON previews use dedicated captions and bounded CSS crop without rewriting original pixels',()=>{
  const doc={createElement(tag){return{tag,children:[],attributes:{},style:{},setAttribute(k,v){this.attributes[k]=v},append(...c){this.children.push(...c)}}}};
  for(const definition of ICON_CARD_ROSTER){
    const card=createIconCard({...definition,lazy:true},doc);
    const rendered=card.children[0].children[0];
    const image=definition.sourceCrop?rendered.children[0]:rendered;
    assert.equal(image.style.objectPosition,`${definition.focusX}% ${definition.focusY}%`);
    assert.equal(image.loading,'lazy');assert.equal(card.children[1].children[0].textContent,definition.name);
    assert.equal(card.children[1].children[1].textContent,'사용자 지정 원화 · 프리뷰 전용');
    assert.doesNotMatch(card.children[1].children[1].textContent,/ZENITH/);
  }
  const card=createIconCard({...ICON_CARD_ROSTER[0],focusX:Infinity,focusY:200},doc);
  assert.equal(card.children[0].children[0].style.objectPosition,'50% 100%');
});

test('preparation has no production route, live loader, DB write, draw registration or battle modification',()=>{
  for(const path of ['index.html','js/app.js','functions/api/[[path]].js','functions/_magic.js','service-worker.js'])assert.doesNotMatch(read(path),/icon-grade-v1|_icon_grade_preparation|icon-card-v1/);
  assert.doesNotMatch(read('functions/_icon_grade_preparation.js'),/\.DB\b|\.prepare\(|INSERT INTO|UPDATE |DELETE FROM/);
  assert.doesNotMatch(read('preview/icon-grade-v1/preview.mjs'),/\bfetch\(|XMLHttpRequest|navigator\.sendBeacon/);
  assert.doesNotMatch(read('css/icon-grade-v1.css'),/grade-(?:ZENITH|FUR|SUPERSTAR)/);
});
