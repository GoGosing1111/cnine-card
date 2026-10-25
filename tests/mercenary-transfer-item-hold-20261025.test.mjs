import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreparedMercenaryLevel,previewExperienceExtraction,handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {transferFixture} from './helpers/mercenary-experience-transfer-db.mjs';
import {emptyTransferState} from '../shared/mercenary-experience-transfer-v1.mjs';
import {experienceTransferKey} from '../functions/_mercenary_experience_transfer.js';

test('free extraction and stored free-potion infusion stop before any database work',async()=>{
 for(const action of ['EXTRACT','INFUSE'])await assert.rejects(runPreparedMercenaryLevel({}, {id:7},{},action),{code:'MERCENARY_TRANSFER_LEGACY_DISABLED',status:423});
 await assert.rejects(previewExperienceExtraction({}, {id:7},{}),{code:'MERCENARY_TRANSFER_LEGACY_DISABLED',status:423});
});
test('public feature advertises item transfer while ordinary growth stays released',async()=>{
 const response=await handleMercenaryLevel({path:'mercenaries/v3/leveling/feature',request:new Request('https://local/api/mercenaries/v3/leveling/feature'),env:{},deps:{json:(v,s)=>Response.json(v,{status:s})}});
 const body=await response.json();assert.equal(body.transferEnabled,true);assert.equal(body.releaseEnabled,true);
});
test('repaired mercenaries can grow again; transfer history does not lock growth',async t=>{
 const f=await transferFixture(t,true),state=emptyTransferState();
 state.mercenaries['V-049']={used:false,bankedXp:0,resetRevision:1};
 await f.setting(experienceTransferKey(7),state);
 await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-049',revision:0},'BREAKTHROUGH'),e=>e.code!=='MERCENARY_TRANSFER_REPAIR_PENDING');
 await assert.rejects(runPreparedMercenaryLevel(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-055',revision:0},'BREAKTHROUGH'),e=>e.code!=='MERCENARY_TRANSFER_REPAIR_PENDING');
});
