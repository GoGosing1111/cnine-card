import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureDamageFont,damageFontFamily,DAMAGE_FONT_FAMILY} from '../shared/battle-damage-font.mjs';
import {createDamageTextPool,configureDamageText} from '../preview/project-v-v3/source/battle/ObjectPool.js';

function environment(t,load){
  const fonts=new Set();let calls=0;
  const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const previousFontFace=Object.getOwnPropertyDescriptor(globalThis,'FontFace');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{fonts}});
  Object.defineProperty(globalThis,'FontFace',{configurable:true,value:class{
    constructor(family,source,options){this.family=family;this.weight=options.weight;this.source=source;}
    load(){calls++;return load(this,calls);}
  }});
  t.after(()=>{
    if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument);else delete globalThis.document;
    if(previousFontFace)Object.defineProperty(globalThis,'FontFace',previousFontFace);else delete globalThis.FontFace;
  });
  return {fonts,calls:()=>calls};
}

test('concurrent battle entries share one font load and wait for the real face',async t=>{
  let ready;const env=environment(t,face=>new Promise(resolve=>{ready=()=>resolve(face);}));
  const first=ensureDamageFont(),second=ensureDamageFont();
  assert.equal(first,second);assert.equal(env.calls(),1);
  assert.notEqual(damageFontFamily(),DAMAGE_FONT_FAMILY);
  ready();assert.equal(await first,true);assert.equal(env.fonts.size,1);
  assert.equal(damageFontFamily(),DAMAGE_FONT_FAMILY);
  assert.equal(await ensureDamageFont(),true);assert.equal(env.calls(),1);
});

test('a slow font never blocks combat and a late success replaces the fallback style',async t=>{
  let ready;environment(t,face=>new Promise(resolve=>{ready=()=>resolve(face);}));
  assert.equal(await ensureDamageFont({timeoutMs:5}),false);
  const pool=createDamageTextPool(1),view=pool.acquire();t.after(()=>pool.destroy());
  configureDamageText(view,{damage:123456,critical:true});const fallback=view.numberLabel.style;
  assert.notEqual(fallback.fontFamily,DAMAGE_FONT_FAMILY);
  ready();await new Promise(resolve=>setImmediate(resolve));
  configureDamageText(view,{damage:123456,critical:true});
  assert.notEqual(view.numberLabel.style,fallback);
  assert.equal(view.numberLabel.style.fontFamily,DAMAGE_FONT_FAMILY);
  assert.equal(view.numberLabel.text,'123,456');
});

test('failed downloads can retry on the next battle without rejecting playback',async t=>{
  const env=environment(t,(face,calls)=>calls===1?Promise.reject(Error('offline')):Promise.resolve(face));
  assert.equal(await ensureDamageFont(),false);assert.notEqual(damageFontFamily(),DAMAGE_FONT_FAMILY);
  assert.equal(await ensureDamageFont(),true);assert.equal(env.calls(),2);
  assert.equal(damageFontFamily(),DAMAGE_FONT_FAMILY);
});

test('Russo damage, combo and healing labels retain the server values across pool reuse',()=>{
  const pool=createDamageTextPool(1),view=pool.acquire();
  try{
    configureDamageText(view,{kind:'SPEED',damage:1234567,critical:true,healing:98765,hitCount:3,hitValues:[123,456,789]});
    assert.equal(view.numberLabel.text,'1,234,567');assert.equal(view.numberGlow.text,'1,234,567');
    assert.equal(view.healLabel.text,'+98,765 HP');assert.equal(view.roleTag.text,'3 HIT · TOTAL');
    assert.deepEqual(view.speedHitLabels.map(label=>label.text),['123','456','789']);
    for(const label of [view.numberLabel,view.numberGlow,view.healLabel,view.hitLabel,...view.speedHitLabels])assert.equal(label.style.fontFamily,DAMAGE_FONT_FAMILY);
    pool.release(view);const reused=pool.acquire();assert.equal(reused,view);
    configureDamageText(reused,{damage:0});
    assert.equal(reused.numberLabel.text,'0');assert.equal(reused.healLabel.text,'');assert.equal(reused.criticalLabel.text,'');
  }finally{pool.destroy();}
});
