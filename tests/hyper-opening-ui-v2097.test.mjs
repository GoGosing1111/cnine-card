import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {MERCENARY_PACK} from '../shared/mercenary-pack-contract-v1.mjs';

test('ON survives a store rerender; OFF and back navigation refresh the same status and buttons',async()=>{
 let enabled=true,observer,observations=0;const listeners=new Map(),replaceable={buttons:[{disabled:true}],labels:[{textContent:'개봉 준비 중'}],statuses:[{textContent:'용병카드 개봉은 현재 OFF입니다.'}]};
 const document={hidden:false,body:{},addEventListener(){},querySelector(){return replaceable.buttons[0];},querySelectorAll(selector){return selector==='[data-mercenary-open]'?replaceable.buttons:selector==='[data-hyper-opening-label]'?replaceable.labels:selector==='[data-mercenary-open-status]'?replaceable.statuses:[];}};
 const context={document,MERCENARY_PACK,api:async()=>({connected:true,userOpeningEnabled:enabled}),console,localStorage:{getItem:()=>null},setInterval:()=>1,clearInterval(){},addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},MutationObserver:class{constructor(fn){observer=fn;}observe(){observations++;}disconnect(){}}};context.window=context;
 const source=fs.readFileSync('js/mercenary-pack-live.mjs','utf8').replace(/^import .+;\r?\n/gm,'').replace(/^export /gm,'');vm.runInNewContext(source,context);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();assert.equal(replaceable.buttons[0].disabled,false);assert.match(replaceable.statuses[0].textContent,/균등 추첨/);
 replaceable.buttons=[{disabled:true}];replaceable.labels=[{textContent:'개봉 준비 중'}];replaceable.statuses=[{textContent:'용병카드 개봉은 현재 OFF입니다.'}];observer();assert.equal(replaceable.buttons[0].disabled,false);assert.equal(replaceable.labels[0].textContent,'용병 계약 개봉 가능');assert.doesNotMatch(replaceable.statuses[0].textContent,/OFF/);
 enabled=false;listeners.get('focus')();await settle();assert.equal(replaceable.buttons[0].disabled,true);assert.match(replaceable.statuses[0].textContent,/OFF/);
 listeners.get('pagehide')();enabled=true;listeners.get('pageshow')({persisted:true});await settle();assert.equal(observations,2);assert.equal(replaceable.buttons[0].disabled,false);assert.doesNotMatch(replaceable.statuses[0].textContent,/OFF/);
});
