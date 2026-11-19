import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {resolveAccountBattleSuitAnimation as resolve} from '../preview/project-v-v3/source/battle/AccountBattleSuitAnimationCatalog.js';
import {P90_PREPARATION as P} from '../scripts/ops/eastern-p90-preparation-20261119.mjs';
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
const root=new URL('../',import.meta.url),weapon=P.outputCode,gold='EQ_1788486888336';
test('P90 resolves the same approved atlas, muzzle and sole pivots on E/F/G/H/S while retaining its item code',()=>{
  for(const suit of ['BATTLE_SUIT_01','BATTLE_SUIT_02','BATTLE_SUIT_03','BATTLE_SUIT_H_BODY','BATTLE_SUIT_S_BODY']){
    const actual=resolve(suit,weapon),approved=resolve(suit,gold);assert(actual&&approved);
    const {weaponCode,resourceWeaponCode,...rest}=actual;
    assert.equal(weaponCode,weapon);assert.equal(resourceWeaponCode,gold);
    assert.deepEqual(rest,Object.fromEntries(Object.entries(approved).filter(([k])=>k!=='weaponCode')));
    const asset=actual.sheetUrl.replace(/^\//,'');
    if(!existsSync(new URL(asset,root)))execFileSync('git',['cat-file','-e','HEAD:'+asset],{cwd:root,windowsHide:true});
    assert.equal(resolve(suit.toLowerCase(),' '+weapon.toLowerCase()+' '),actual);
    for(const other of ['EASTERN_WEAPON_DRAFT_02','EASTERN_WEAPON_DRAFT_03'])assert.equal(resolve(suit,other),null);
  }
  for(const suit of ['BATTLE_SUIT_Z_BODY','BATTLE_SUIT_X_BODY','BATTLE_SUIT_OVERLORD','BATTLE_SUIT_SX'])assert.equal(resolve(suit,weapon),null);
});
test('P90 fallback uses the approved transparent weapon, never the square inventory card',()=>{
  const engine=readFileSync(new URL('preview/project-v-v3/source/battle/BattleEngine.js',root),'utf8');
  const constants=engine.match(/const ACCOUNT_WEAPON_CUTOUTS=Object\.freeze\(\{[\s\S]*?\n\}\);/)[0];
  const fn=engine.slice(engine.indexOf('function weaponAppearanceUrl('),engine.indexOf('\nfunction accountNickname('));
  const context={appearanceObject:x=>x,rootAssetPath:x=>x};vm.createContext(context);
  vm.runInContext(constants+'\n'+fn+'\nthis.resolve=weaponAppearanceUrl;',context);
  assert.equal(context.resolve({code:weapon,image_url:'/assets/items/eastern-weapons-gold-silver-v1/weapon-01-512.png'}),context.resolve({code:gold}));
  assert.equal(context.resolve({code:'EASTERN_WEAPON_DRAFT_02',image_url:'/square.png'}),'');
});
test('unconfigured P90 draft cannot spend resources even if its flags are accidentally enabled',async t=>{
  const f=await equipmentFixture(t,true);
  await f.p('UPDATE workshop_recipes_v1668 SET is_active=0,is_public=0,owner_test_only=1,coin_cost=0,master_star_cost=0 WHERE id=?',f.recipeId).run();
  await f.setting('WORKSHOP_EQUIPMENT_CRAFT_V1:QA_EQUIPMENT',P.policy);
  await assert.rejects(f.craft('p90-draft-closed'),/제작할 수 없는/);
  await f.p('UPDATE workshop_recipes_v1668 SET is_active=1,is_public=1,owner_test_only=0 WHERE id=?',f.recipeId).run();
  await assert.rejects(f.craft('p90-draft-unconfigured'),/투입 장비|투입할 장비/);
  assert.equal(await f.coin(),12000000000000);assert.equal(await f.quantity('MASTER_STAR'),100);assert.equal(await f.quantity('QA_MATERIAL'),100);
  assert(await f.p('SELECT id FROM user_equipment_instances WHERE id=1').first());
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM workshop_craft_logs_v1668').first()).n),0);
});
