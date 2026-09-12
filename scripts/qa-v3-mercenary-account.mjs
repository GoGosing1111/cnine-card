import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {MERCENARY_COMBAT_DRAFT} from '../shared/mercenary-combat-policy-v1.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8899',output=path.resolve('../qa/mercenary-account');
if(new URL(base).hostname!=='127.0.0.1')throw Error('Local QA only');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const errors=[],results=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(()=>localStorage.setItem('cnine_card_api_token','local-account-7'));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack));
 if(process.env.QA_BATTLE_ONLY!=='1'){await page.goto(base+'/mercenary-hangar/');await page.locator('#open:not([disabled])').waitFor();
 await page.selectOption('#draw-count','10');await page.click('#open');await page.locator('#roster [data-code]').first().waitFor();
 if(await page.locator('#equip').isEnabled())await page.click('#equip');await page.waitForFunction(()=>document.getElementById('slot').textContent.includes('편성 중'));
 const nextLevel=Number(await page.locator('#level').textContent())+1;await page.locator('#train:not([disabled])').waitFor();await page.click('#train');await page.locator('#level-up:not([disabled])').waitFor();assert.match(await page.locator('#level-cost').textContent(),/1,000 코인/);await page.click('#level-up');await page.waitForFunction(level=>Number(document.getElementById('level').textContent)===level,nextLevel);
 await page.reload();await page.waitForFunction(level=>Number(document.getElementById('level').textContent)===level,nextLevel);
 assert.match(await page.locator('#slot').textContent(),/편성 중/);results.push('open 10, equip separate slot, train, paid level, reload');
 for(const width of[1440,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(output,`hangar-${width}.png`),fullPage:true});}
 }
 const catalog=JSON.parse(await fs.readFile('assets/ui/project-v/characters/fur/manifest-v2.json','utf8')).characters.slice(0,5);
 const cards=catalog.map((c,i)=>({...c,id:String(c.cardId),title:c.member,rarity:'FUR',image:c.sourceArt,power:10000,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]}));
 const art=MERCENARY_CMS_SEED.catalog.cards[0],skill={...MERCENARY_CMS_SEED.document.skills.find(s=>s.mechanic==='TWO_BEAT_FOLLOWUP'),balance:{damageRatio:1,cooldownTurns:8,cost:10}};
 // Independent local visual fixture. This does not write a CMS assignment.
 const mercenary={...art,name:'별도 슬롯 검수',rank:'C',role:'VANGUARD',position:'FRONT',level:1,basePower:10000,stats:{hp:100000,attack:1000,defense:100,speed:2000},combat:MERCENARY_COMBAT_DRAFT,skills:[skill]};
 const battleV2=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:12});
 for(const width of[1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/pve-v3/battle.html?content=idle-dungeon');await page.waitForFunction(()=>Boolean(window.PveV3BattleBridge),{timeout:60000});
  await page.evaluate(payload=>window.PveV3BattleBridge.prepare(payload),{mode:'PVP',battlefieldMode:'PVP',title:'용병 양 진영 검수',playerName:'검수 A',opponentName:'검수 B',cards,battleV2});
  const d=await page.evaluate(()=>window.PveV3BattleBridge.diagnostics());assert.equal(d.cards,10);assert.equal(d.canvasCount,1);assert.equal(d.formation.mercenaries.length,2);
  const events=battleV2.result.timeline.filter(e=>e.type.startsWith('MERCENARY_')).slice(0,12);
  await page.evaluate(async events=>{for(const event of events)await window.ProjectVPixiBattle.playEvents([event]);},events);
  await page.screenshot({path:path.join(output,`battle-${width}.png`),fullPage:true});results.push(`PVP ${width}: 5+1 per side, authoritative events`);
  await page.evaluate(()=>window.PveV3BattleBridge.dispose());
 }
 assert.deepEqual(errors,[]);console.log('Mercenary account and mirrored battle QA passed.');
}finally{await fs.writeFile(path.join(output,'qa.json'),JSON.stringify({results,errors},null,2));await browser.close();}
