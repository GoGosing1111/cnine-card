import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await cooperativeMiniflare(),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const {payload}=createCooperativeBattle({squads:coopSquads(),seed:7919}),out=path.join(h.temp,'enemy-playback');await fs.mkdir(out,{recursive:true});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
 await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-qa-1');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:1,serverUserId:1,nickname:'검수',role:'OWNER',coin:1000,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true}));localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
 await page.goto(h.origin+'/');await page.waitForFunction(()=>window.CNineCoreRaidBridge);await page.evaluate(()=>renderShell('battle'));
 await page.evaluate(async p=>{
  await window.CNineCoreRaidBridge.ensureFeatureResources('battleV2');
  await new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/raid/cooperative/style.css';link.onload=resolve;document.head.append(link);});
  const portal=document.createElement('section');portal.className='coop-battle-portal';const host=document.createElement('div');portal.append(host);document.body.append(portal);
  const {mountCoopBattle}=await import('/raid/cooperative/battle.mjs');window.coopQA=await mountCoopBattle(host,p);
 },payload);
 await page.locator('.coop-battle-portal canvas').waitFor({state:'visible'});
 const events=payload.battleV2.result.timeline,watcher=events.find(e=>e.actorId==='B:2:COOP:WATCHER'&&['ATTACK','TURN'].includes(e.type));assert.ok(watcher);
 await page.evaluate(e=>{window.qaPlay=ProjectVPixiBattle.playEvents([e],{timedInternal:true});},watcher);
 await page.waitForFunction(()=>ProjectVPixiBattle.diagnostics().cooperativePlayback?.kind==='WATCHER_VOLLEY');
 await page.screenshot({path:path.join(out,'watcher-volley.png')});await page.evaluate(()=>window.qaPlay);
 const volley=await page.evaluate(()=>ProjectVPixiBattle.diagnostics().cooperativePlayback);assert.equal(volley.shots,2);assert.equal(volley.effectFrames,8);
 const spawn=events.find(e=>e.type==='ENEMY_SPAWN'&&e.targetId.endsWith(':ARKE'));
 await page.evaluate(e=>ProjectVPixiBattle.playEvents([e],{timedInternal:true}),spawn);
 const attack=events.find(e=>e.actorId==='B:1:COOP:ARKE'&&['ATTACK','TURN'].includes(e.type));assert.ok(attack);
 await page.evaluate(e=>{window.qaPlay=ProjectVPixiBattle.playEvents([e],{timedInternal:true});},attack);
 await page.waitForFunction(()=>ProjectVPixiBattle.diagnostics().cooperativePlayback?.kind==='ARKE_SLAM');
 await page.screenshot({path:path.join(out,'arke-slam.png')});
 await page.evaluate(async()=>{ProjectVPixiBattle.cancelActiveAnimations();await window.qaPlay;});
 const diagnostics=await page.evaluate(()=>ProjectVPixiBattle.diagnostics());assert.equal(diagnostics.cooperativePlayback.motionFrames,8);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks:['two-shot stationary watcher volley','eight-frame Arke slam','mid-motion cancellation'],errors,diagnostics},null,2));console.log('PASS cooperative enemy playback:',out);
}finally{await browser.close();await h.dispose();}
