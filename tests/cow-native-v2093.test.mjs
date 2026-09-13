import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {cowPortalBattleEligible,cowPortalNoticeEligible} from '../shared/cow-portal-eligibility.mjs';
import {discoverCowPortal,discoverCowPortalReady} from '../functions/_cow_room_portal.js';
import {pvePublicContentState} from '../shared/pve-public-release-v2092.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('PVP, ranked, territory and other modes cannot roll or display a portal, including a stored portal',async()=>{
 const env=new Proxy({},{get(){throw Error('No DB read permitted');}}),portal={id:'saved',state:'OPEN',difficulty:'STANDARD',sourceType:'HUNT'};
 for(const mode of ['PVP','SIEGE','TERRITORY','RANKED','RANK','RAID','TOWER','COW_ROOM','SCRAPYARD','IDLE',undefined]){
  const event={sourceType:'HUNT',sourceRef:'forged',battleMode:mode,result:'WIN'};assert.equal(cowPortalBattleEligible(event),false);assert.equal(await discoverCowPortal(env,{id:7},event),null);assert.equal(await discoverCowPortalReady(env,{id:7},event),null);assert.equal(cowPortalNoticeEligible(portal,mode),false);
 }
 assert.equal(cowPortalNoticeEligible(portal,'PVE'),true);assert.equal(cowPortalNoticeEligible({...portal,difficulty:'APOCALYPSE'},'APOCALYPSE'),true);assert.equal(cowPortalBattleEligible({sourceType:'SWEEP',battleMode:'APOCALYPSE'}),false);
});
test('native Cow entry preserves game shell and shared V3; original Scrapyard entry cannot be intercepted',()=>{
 assert.equal(pvePublicContentState().COW_ROOM.url,'/?screen=battle&pve=cow-room');assert.equal(pvePublicContentState().SCRAPYARD.url,'/?screen=scrapyard');
 const cow=read('js/cow-room-live.mjs'),nav=read('js/pve-v3-navigation.mjs'),scrap=read('js/workshop-v1881.js');
 assert.match(cow,/pveV2LiveViewport/);assert.match(cow,/ProjectVBattleV3Live\.createRenderer/);assert.match(cow,/createPveContinuousSession/);assert.doesNotMatch(cow,/<iframe|battle\.html|location\.assign\('\/pve-v3/);
 assert.doesNotMatch(nav,/cowPortalPrompt\.recover/);assert.match(nav,/if\(content==='scrapyard'\)return false/);assert.doesNotMatch(scrap,/PveV3Runtime\?\.tryOpen/);assert.match(scrap,/api\('scrapyard\/run'/);
});
