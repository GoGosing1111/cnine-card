import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {defenseOwnedLoadout,monsterDefenseFixture} from './helpers/monster-defense-fixture.mjs';
import {chip} from '../scripts/ops/quantum-bomb-defense-20261125.mjs';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=process.env.QA_OUT||path.join(os.tmpdir(),'quantum-defense-acquisition');
await mkdir(directory,{recursive:true});
const h=await monsterDefenseFixture();
const browser=await chromium.launch({channel:'chrome',args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
  await h.db.batch([h.db.prepare("INSERT INTO inventory_items(code,name,rarity,image_url,is_active) VALUES(?,?,'SPECIAL',?,1)").bind(chip.code,chip.name+' 스킬칩',chip.image)]);
  const {settings}=await h.api(1,'admin/defense/settings');
  settings.mode='ON';settings.rewardsEnabled=true;
  settings.difficulties.forEach(d=>{d.clearReward.items=[{code:chip.code,quantity:1}];});
  assert.equal((await h.api(1,'admin/defense/settings',{settings,requestId:crypto.randomUUID()})).status,200);
  const a=await h.api(2,'defense/create',{capacity:2,difficulty:'NORMAL',loadout:defenseOwnedLoadout(),requestId:crypto.randomUUID()});
  const b=await h.api(3,'defense/join',{roomId:a.roomId,loadout:defenseOwnedLoadout(),requestId:crypto.randomUUID()});
  for(const s of [a,b])assert.equal((await h.ready(s)).status,200);
  assert.equal((await h.live(a,'command',{requestId:crypto.randomUUID(),command:{type:'START'}})).status,200);
  const room=await h.room(a.roomId);
  room.phase='WAVE';room.wave=room.encounter.waves;room.enemies=[];room.spawnQueue=[];room.serverAt=Date.now()-300;
  await h.room(a.roomId,room);await h.live(a,'state');
  for(const [user,width,height,label] of [[2,1440,900,'desktop'],[3,390,844,'mobile']]){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
    await context.addInitScript(id=>{localStorage.setItem('cnine_card_api_token','local-qa-'+id);localStorage.setItem('cnine_battle_sound','OFF');},user);
    const page=await context.newPage();
    await page.goto(h.origin+'/defense/');
    const dialog=page.getByRole('dialog',{name:'희귀 스킬칩 획득'});
    await dialog.waitFor();await dialog.locator('img.bp-reveal-art').evaluate(img=>img.decode());
    assert.match(await dialog.textContent(),/양자폭탄 스킬칩.*1개/);
    await dialog.screenshot({path:path.join(directory,label+'.png'),animations:'disabled'});
    await dialog.getByRole('button',{name:'확인'}).click();
    await page.reload();await page.locator('#result-reward-items').getByText(/양자폭탄 스킬칩/).waitFor();
    assert.equal(await page.locator('dialog.bp-reveal').count(),0);
    await context.close();
  }
  const [logs]=await h.db.batch([{sql:"SELECT COUNT(*) n FROM inventory_logs WHERE item_code='SKILL_CHIP_QUANTUM_BOMB'"}]);
  assert.equal(logs.results[0].n,2);console.log('Desktop and mobile clear receipts reveal one chip each; reopening shows only the receipt.');
}finally{await browser.close();await h.dispose();}
