import test from 'node:test';
import assert from 'node:assert/strict';
import {jinmuDialogueAllowed,JINMU_DIALOGUE_LINES} from '../preview/project-v-v3/source/battle/JinmuDialogue.js';

const engine=(mode,extra={})=>({activeBattlefieldMode:'HUNT',livePayload:true,battleData:{mode,battleV2:{mode:'PVE'},...extra}});
test('Jinmu dialogue is confined to non-raid PVE even when the renderer defaults to HUNT',()=>{
 for(const mode of ['PVE','HUNT','TOWER','SEAL','ESCORT','DUNGEON','APOCALYPSE','SCRAPYARD','COW','IDLE'])assert.equal(jinmuDialogueAllowed(engine(mode)),true,mode);
 for(const mode of ['RAID','WORLD_RAID','WORLD_BOSS','MADARA_RAID','CORE_RAID','COOP','PVP','RANKED','ARENA','SIEGE','TERRITORY'])assert.equal(jinmuDialogueAllowed(engine(mode)),false,mode);
 for(const field of ['battlefieldMode','contentType','type'])assert.equal(jinmuDialogueAllowed(engine('PVE',{[field]:'MADARA_RAID'})),false,field);
 assert.equal(jinmuDialogueAllowed({...engine('PVE'),activeBattlefieldMode:'RAID'}),false);
 assert.equal(jinmuDialogueAllowed({...engine('PVE'),formationCoop:true}),false);
 assert.equal(jinmuDialogueAllowed({...engine('PVE'),host:{closest:()=>({})}}),false);
 assert.equal(jinmuDialogueAllowed({}),false);
});
test('five distinct short lines are available for one-per-cast rotation',()=>{
 assert.equal(JINMU_DIALOGUE_LINES.length,5);assert.equal(new Set(JINMU_DIALOGUE_LINES).size,5);
 assert(JINMU_DIALOGUE_LINES.every(line=>line.length<=32&&!/[<>]/.test(line)));
});

test('the three-squad foundry battleground is PVE despite its shared RAID renderer',()=>{
 const battleground={...engine('RAID',{sceneAssetKey:'COOP_ARKE_FORGE',battleV2:{rules:{formation:'COOP_THREE_SQUADS'}}}),activeBattlefieldMode:'RAID',formationCoop:true,coopArkeBattlefield:true};
 assert.equal(jinmuDialogueAllowed(battleground),true);
 assert.equal(jinmuDialogueAllowed({...battleground,battleData:{...battleground.battleData,sceneAssetKey:'WORLD_RAID'}}),false);
 assert.equal(jinmuDialogueAllowed({...battleground,battleData:{...battleground.battleData,battleV2:{rules:{formation:'FIVE_CARDS'}}}}),false);
 for(const mode of ['MADARA_RAID','WORLD_RAID','LICH_RAID','CORE_RAID','PVP'])assert.equal(jinmuDialogueAllowed({...battleground,battleData:{...battleground.battleData,mode}}),false,mode);
 assert.equal(jinmuDialogueAllowed({...battleground,host:{closest:()=>({})}}),false);
});
