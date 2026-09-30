import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin='http://127.0.0.1:8977',out=process.env.ICON_QA_OUT;assert.ok(out);
const cards=ICON_LIVE_CARDS.slice(0,5).map(c=>({...c,id:c.cardId,rarity:'ICON',image:c.sourceArt,power:180000}));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{for(const [width,mode] of [[1440,'PVE'],[390,'PVP']]){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
 const monster={id:1,name:'검수 슬라임',image:'assets/cards/monster/sla2.jfif',battle_power:1000};
 const battleV2=mode==='PVE'?createPveBattleV2({cards,monster,seed:10}):createPvpBattleV2({attackerCards:cards,defenderCards:cards.map(c=>({...c,power:1000})),seed:10});
 await page.goto(origin+'/pve-v3/battle.html?content=idle-dungeon');await page.waitForFunction(()=>window.PveV3BattleBridge&&window.IconFusion);
 await page.evaluate(payload=>window.PveV3BattleBridge.prepare(payload),{battleV2,cards,monster,mode,battlefieldMode:mode,playerName:'아이콘 검수',opponentName:'검수 상대'});
 const expected=mode==='PVE'?5:10;assert.equal(await page.locator('.battle-v3-roster .icon-live-frame').count(),expected);
 assert.ok((await page.locator('.battle-v3-roster .icon-live-art').evaluateAll(images=>images.map(i=>i.getAttribute('src')))).every(src=>src.includes('assets/cards/ICON/')));
 const bounds=await page.locator('.battle-v3-roster .icon-live-portrait').evaluateAll(elements=>elements.map(e=>{const b=e.getBoundingClientRect();return {width:b.width,height:b.height,ratio:b.width/b.height};}));assert.ok(bounds.every(b=>b.width>20&&Math.abs(b.ratio-2/3)<.01));
 await page.screenshot({path:path.join(out,`battle-${mode}-${width}.png`)});
 await page.evaluate(async()=>{window.PveV3BattleBridge.setSpeed(2);await window.PveV3BattleBridge.play();});assert.deepEqual(errors,[]);
 reports.push({width,mode,cards:expected,photoFrames:true,separateSd:true,playbackComplete:true,bounds,errors});await page.close();
}fs.writeFileSync(path.join(out,'battle-report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));}finally{await browser.close();}
