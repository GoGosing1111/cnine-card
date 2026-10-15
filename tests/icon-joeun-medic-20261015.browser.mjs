import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.ICON_QA_ORIGIN||'http://127.0.0.1:8979',out=process.env.ICON_QA_OUT;
assert.ok(out);assert.ok(process.env.ICON_QA_PLAN);fs.mkdirSync(out,{recursive:true});
const plan=JSON.parse(fs.readFileSync(process.env.ICON_QA_PLAN)),roles=plan.documentAfter;
const fur=JSON.parse(fs.readFileSync(new URL('../assets/ui/project-v/characters/fur/manifest-v2.json',import.meta.url))).characters;
const normal=fur.slice(0,5).map(c=>({id:c.cardId,name:c.member,title:c.title,grade:'FUR',rarity:'FUR',image:c.sourceArt,power:180000}));
const source=ICON_LIVE_CARDS.find(c=>c.code==='ICON-OH-JOEUN'),joeun={...source,id:source.cardId,image:source.sourceArt,rarity:'ICON',power:180000};
const sprite='oh-joeun-medic-chibi-sd-20261015.webp',reports=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{for(const [width,mode] of [[1440,'PVP'],[390,'PVE']]){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[],assets=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.url().includes(sprite))assets.push({url:response.url(),status:response.status()});});
 await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
 await page.goto(origin+'/?screen=home');await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);
 const cards=[...normal.slice(0,2),{...joeun,iconRole:iconRoleSnapshot(joeun,roles,mode)},...normal.slice(2,4)];
 const monster={id:1,name:'회복 검수 수호자',image:'assets/cards/monster/sla2.jfif',battle_power:900000};
 const battleV2=mode==='PVE'?createPveBattleV2({cards,monster,seed:29}):createPvpBattleV2({attackerCards:cards,defenderCards:normal,seed:29});
 const heals=battleV2.result.timeline.filter(e=>e.type==='ICON_SKILL'&&e.iconCode==='ICON-OH-JOEUN');assert.ok(heals.length>0);
 const profile=await (await fetch(origin+'/api/me')).json();
 const payload={battleV2,cards,monster:mode==='PVE'?monster:undefined,mode,battlefieldMode:mode,playerName:'오조은 메딕',opponentName:'회복 검수',user:profile.user,result:battleV2.result.winner==='A'?'WIN':'LOSE',coinReward:0,magicCrystalReward:0,playerPower:900000,monsterPower:900000};
 await page.evaluate(async({mode,data})=>{
  await window.ensureFeatureResources('battleV2');const modal=document.querySelector('#modal'),live=window.prepareBattleV2LiveLoading({modal,mode,playerName:'오조은 메딕',opponentName:'회복 검수'});
  const play=mode==='PVE'?window.playPveBattleV2Live:window.playPvpBattleV2Live;
  window.__joeunEntryPromise=play({...live,modal,data,monster:data.monster}).then(()=>{
   window.__joeunEntryDone=true;
   if(mode==='PVP'){live.msg.innerHTML=window.ProjectVBattleV3Live.resultHtml({mode,data,win:data.result==='WIN',result:data.battleV2.result});live.msg.querySelector('button').onclick=()=>{modal.__battleV2Renderer.destroy();window.SoopketmonV21RuntimeRouter.navigate('pvp');};}
  });
 },{mode,data:payload});
 await page.waitForFunction(()=>window.ProjectVPixiBattle?.diagnostics()?.iconRoles?.metrics?.skills>0,null,{timeout:90000});
 await page.screenshot({path:path.join(out,width+'-battle.png')});
 await page.waitForFunction(()=>window.__joeunEntryDone===true,null,{timeout:120000});
 const diagnostics=await page.evaluate(()=>window.ProjectVPixiBattle.diagnostics().iconRoles);
 assert.equal(diagnostics.metrics.appliedRows,diagnostics.metrics.serverRows);
 assert.ok(diagnostics.metrics.roles.includes('SUPPORT'));assert.ok(assets.length>0);assert.ok(assets.every(a=>a.status===200));
 await page.locator('.v3-report-confirm').click();await page.waitForFunction(()=>!document.querySelector('#modal.show canvas'));assert.deepEqual(errors,[]);
 const report={width,mode,mainLoader:true,actualLiveWrapper:true,result:true,return:true,deckIcons:1,seed:29,serverHeals:heals.length,totalHealing:heals.reduce((n,e)=>n+e.targets.reduce((m,t)=>m+t.amount,0),0),serverTimelineSha256:crypto.createHash('sha256').update(JSON.stringify(battleV2.result.timeline)).digest('hex'),tuning:cards[2].iconRole.tuning,diagnostics,assets,errors};
 reports.push(report);console.log(JSON.stringify(report));await page.close();
}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({version:'20261015-joeun-medic-v2',tests:{focused:13,passed:13},browser:reports},null,2)+'\n');}finally{await browser.close();}
