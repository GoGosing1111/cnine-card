import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {blockedRequest,excludedAsset,allowsRoute,filterRecords} from '../packaging/onestore/web/policy.mjs';
test('ONE store permanently blocks removed features and admin requests',()=>{
  for(const path of ['/api/server-support/apply','/api/server-support/package/apply','/api/admin/server-support/package','/api/coin-prediction/join','/api/prison-camp/release','/api/prison-death-game/bite','/api/%73erver-support/info','/admin/?supportPackage=1'])assert.equal(blockedRequest(path),true,path);
  for(const path of ['/api/me','/api/messages','/api/pvp/config','/api/pets/state','/api/prison/status'])assert.equal(blockedRequest(path),false,path);
  for(const route of ['prediction','prisoncamp','seasonPass','supportPackage'])assert.equal(allowsRoute(route),false);
  for(const route of ['home','inventory','messages','pvp','world','petCodex'])assert.equal(allowsRoute(route),true);
});
test('excluded assets are filtered without removing ordinary pet and item resources',()=>{
  for(const path of ['/js/server-support-v1.mjs','/shared/support-package-v1.mjs','/assets/ui/season-pass-v1/reward-chest.webp','/js/clan-prison-camp-v2083.js'])assert.equal(excludedAsset(path),true,path);
  for(const path of ['/js/pet-equipment-window-v1.mjs','/assets/items/sss-limited-shard-20261020/item.webp','/js/supporter-message-expiry-v1.mjs'])assert.equal(excludedAsset(path),false,path);
});
test('message filtering creates a local copy and never changes source records',()=>{
  const original={messages:[{id:1,message_type:'SUPPORT_BANK_ACCOUNT',title:'입금 안내',cleanupEligible:1},{id:2,message_type:'SYSTEM',title:'49,800원 패키지 구매',cleanupEligible:1},{id:3,message_type:'REWARD',title:'전투 보상',is_read:0,cleanupEligible:0}],unread:3,cleanupCount:2};
  const before=JSON.stringify(original),filtered=filterRecords(original);
  assert.deepEqual(filtered.messages.map(m=>m.id),[3]);assert.equal(filtered.unread,1);assert.equal(filtered.cleanupCount,0);assert.equal(JSON.stringify(original),before);
});
test('a history entry or operation cannot expose donation/prediction copy',()=>{
  const value=filterRecords({items:[{title:'시즌패스 안내'},{title:'모험 업데이트'}],history:[{type:'SUPPORT_PACKAGE',title:'지급 완료'}]});
  assert.equal(value.items.length,1);assert.deepEqual(value.history,[]);
});
test('APK variant keeps the website and original clients outside its writes',async()=>{
  const source=await readFile(new URL('../scripts/onestore/prepare-apk.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/deploy:production|wrangler|DELETE FROM|UPDATE users|git push/);
  assert.match(source,/websiteModified:false,existingClientsModified:false/);
  const bootstrap=await readFile(new URL('../packaging/onestore/web/bootstrap.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(bootstrap,/localStorage\.removeItem|localStorage\.setItem|HIDE_COMPLETED.*method:/);
});
