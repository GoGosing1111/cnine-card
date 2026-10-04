import test from 'node:test';
import assert from 'node:assert/strict';
import {magicFixture} from './helpers/magic-presets-fixture.mjs';
import {magicSeason2PackDraft} from '../shared/magic-pack-seasons-v1.mjs';
import {MAGIC_S2_PACK_SETTINGS_KEY,magicSeason2PackSettings} from '../functions/_magic_season2_pack.js';

test('season2 absolute probabilities retain unassigned outcomes and owner-entered star amounts',()=>{
 const draft=magicSeason2PackDraft();
 assert.equal(draft.packRewards.magicCardChance,5);assert.equal(draft.packRewards.masterStarChance,10);
 assert.equal(draft.unassignedChance,85);assert.equal(draft.noRewardChance,0);assert.equal(draft.rewardConfigurationComplete,false);
 const blank=magicSeason2PackDraft({packRewards:{masterStarMin:'',masterStarMax:''}});
 assert.equal(blank.packRewards.masterStarMin,null);assert.equal(blank.packRewards.masterStarMax,null);
 const configured=magicSeason2PackDraft({openingEnabled:true,purchaseEnabled:true,drawEnabled:true,drawCoinCost:1,packRewards:{masterStarMin:123,masterStarMax:456,remainderPolicy:'NONE',magicCrystalWeight:100,cardShardWeight:100}});
 assert.equal(configured.noRewardChance,85);assert.equal(configured.unassignedChance,0);assert.equal(configured.rewardConfigurationComplete,true);
 assert.equal(configured.openingEnabled,false);assert.equal(configured.purchaseEnabled,false);assert.equal(configured.drawEnabled,false);assert.equal(configured.drawCoinCost,1_000_000_000);
 assert.deepEqual(Object.keys(configured.packRewards).sort(),['magicCardChance','masterStarChance','masterStarMin','masterStarMax','remainderPolicy'].sort());
});

test('invalid probability and quantity drafts are rejected without silent normalization',()=>{
 for(const packRewards of [{magicCardChance:90,masterStarChance:11},{magicCardChance:-1},{masterStarChance:101},{magicCardChance:NaN},{magicCardChance:'5'},{masterStarMin:0},{masterStarMin:1.5},{masterStarMax:Number.MAX_SAFE_INTEGER+1},{masterStarMin:20,masterStarMax:10},{remainderPolicy:'MAGIC_CRYSTAL'}]){
  assert.throws(()=>magicSeason2PackDraft({packRewards}));
 }
 const partial=magicSeason2PackDraft({packRewards:{masterStarMin:100}});
 assert.equal(partial.rewardConfigurationComplete,false);assert.equal(partial.packRewards.masterStarMax,null);
});

test('OWNER CMS saves season2 independently, invalidates public cache and never opens the pack',async t=>{
 const f=await magicFixture(true);t.after(()=>f.close());
 const logs=[],deps={authenticate:f.user,readBody:r=>r.json(),json:(b,status=200)=>Response.json(b,{status}),writeAdminLog:async(...args)=>logs.push(args)};
 const originalS1=await f.p("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'").first();
 const saved={action:'SAVE_SEASON2_PACK',settings:{enabled:true,openingEnabled:true,drawEnabled:true,packRewards:{magicCardChance:5,masterStarChance:10,masterStarMin:12345,masterStarMax:54321,remainderPolicy:'NONE'}}};
 for(const role of ['USER','ADMIN']){
  await f.p('UPDATE users SET role=? WHERE id=1',role).run();f.queries.length=0;
  assert.equal((await f.call('admin/magic-system',saved,deps)).status,403);
  assert.equal(f.queries.some(q=>/^(?:INSERT|UPDATE|DELETE)/.test(q)),false);
 }
 await f.p("UPDATE users SET role='OWNER' WHERE id=1").run();
 await f.call('magic/status'); // Prime the same public cache read by the live client.
 const beforeUser=await f.user(),response=await f.call('admin/magic-system',saved,deps);
 assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.season2Pack.openingEnabled,false);assert.equal(result.season2Pack.drawCoinCost,1_000_000_000);
 assert.deepEqual((await magicSeason2PackSettings(f.env)).packRewards,saved.settings.packRewards);
 const status=await(await f.call('magic/status')).json();
 assert.deepEqual(status.summonSeasons[1].packRewards,saved.settings.packRewards);
 assert.equal(status.summonSeasons[1].packRewards.magicCardChance,5);assert.equal(status.summonSeasons[1].packRewards.masterStarChance,10);
 assert.equal((await f.call('magic/draw',{season:'S2',count:1,requestId:'cms-does-not-open'})).status,503);
 assert.equal((await f.call('magic/pack/open',{season:'S2',count:1,requestId:'cms-does-not-open'})).status,503);
 assert.deepEqual(await f.user(),beforeUser);
 assert.deepEqual(await f.p("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'").first(),originalS1);
 assert.equal(logs.length,1);assert.equal(logs[0][2],'MAGIC_S2_PACK_SAVE');
 const prior=await f.p('SELECT value FROM app_meta WHERE key=?',MAGIC_S2_PACK_SETTINGS_KEY).first();
 assert.equal((await f.call('admin/magic-system',{action:'SAVE_SEASON2_PACK',settings:{packRewards:{magicCardChance:99,masterStarChance:10}}},deps)).status,400);
 assert.deepEqual(await f.p('SELECT value FROM app_meta WHERE key=?',MAGIC_S2_PACK_SETTINGS_KEY).first(),prior);
 await f.call('admin/magic-system',{action:'SAVE_SETTINGS',settings:JSON.parse(originalS1.value)},deps);
 assert.deepEqual(await f.p('SELECT value FROM app_meta WHERE key=?',MAGIC_S2_PACK_SETTINGS_KEY).first(),prior);
 assert.deepEqual(await f.user(),beforeUser);
});
