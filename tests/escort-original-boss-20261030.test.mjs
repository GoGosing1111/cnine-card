import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {ESCORT_ORIGINAL_BOSS as boss,defaultEscortSettings,cleanEscortSettings,normalizeEscortResponsePresentation,escortSectorMonster} from '../functions/_escort_operation.js';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
const legacy='/assets/responsive/project-v/monsters/tower-028-violet-magus-boss-sd-v1-768.webp';

test('escort default uses a dedicated original-IP boss with a bounded real WebP',async()=>{
 const sector=defaultEscortSettings().sectors[3];assert.equal(sector.enemyName,boss.name);assert.equal(sector.enemyImage,boss.image);
 const file=new URL('..'+boss.image,import.meta.url),bytes=await readFile(file);assert.equal(bytes.toString('ascii',8,12),'WEBP');assert((await stat(file)).size<300000);
});
test('stored production-style settings replace presentation only and retain balances and custom settings',()=>{
 const raw=defaultEscortSettings();Object.assign(raw,{weeklyRunLimit:20,weeklyRewardLimit:15,repairPercent:10});
 Object.assign(raw.sectors[3],{enemyName:'보랏빛 공성술사',enemyImage:legacy,enemyPower:1550000,hazardPercent:12,brief:'운영에서 설정한 설명'});
 const before=structuredClone(raw),expected=structuredClone(raw);Object.assign(expected.sectors[3],{enemyName:boss.name,enemyImage:boss.image});
 assert.deepEqual(cleanEscortSettings(raw),expected);assert.deepEqual(raw,before);
 const custom=structuredClone(expected);Object.assign(custom.sectors[3],{enemyName:'자체 IP 후속 보스',enemyImage:'/assets/custom-boss.webp'});assert.deepEqual(cleanEscortSettings(custom),custom);
});
test('legacy PNG, responsive WebP, CDN and known old names resolve without replacing other sectors',()=>{
 for(const image of [legacy,legacy+'?v=1830','/assets/ui/project-v/monsters/hunt-tower/tower-028-violet-magus-boss-sd-v1.png','https://cdn.example.test'+legacy]){
  const s=defaultEscortSettings();Object.assign(s.sectors[3],{enemyName:'운영 별칭',enemyImage:image});assert.equal(cleanEscortSettings(s).sectors[3].enemyImage,boss.image);
 }
 for(const enemyName of ['아이젠','아이젠 소스케','Aizen Sosuke']){const s=defaultEscortSettings();s.sectors[3]={...s.sectors[3],enemyName,enemyImage:'/old-art.png'};assert.equal(cleanEscortSettings(s).sectors[3].enemyName,boss.name);}
 const s=defaultEscortSettings();assert.deepEqual(cleanEscortSettings(s).sectors.filter((_,i)=>i!==3),s.sectors.filter((_,i)=>i!==3));
});
test('completed replay presentation changes without mutating receipt, run progression, HP or reward',()=>{
 const sector={...defaultEscortSettings().sectors[3],enemyName:'보랏빛 공성술사',enemyImage:legacy};
 const receipt={ok:true,replayed:true,run:{runId:'existing',sectorIndex:3,sector,vehicleHp:4321,phase:'READY',reward:{coin:830000,shards:58,tickets:4},cardHp:{one:85}},reward:{coin:620000,shards:45,tickets:3}};
 const before=structuredClone(receipt),expected=structuredClone(receipt);Object.assign(expected.run.sector,{enemyName:boss.name,enemyImage:boss.image});
 assert.deepEqual(normalizeEscortResponsePresentation(receipt),expected);assert.deepEqual(receipt,before);
 const settings={sectors:[sector]};assert.equal(normalizeEscortResponsePresentation({settings}).settings.sectors[0].enemyImage,boss.image);
});
test('actual monster payload uses original art everywhere and keeps seeded escort combat outcome',()=>{
 const sector={...defaultEscortSettings().sectors[3],enemyPower:1550000};
 const monster=escortSectorMonster(sector,1550000),old={...monster,name:'보랏빛 공성술사',image:legacy,image_url:legacy,projectVMonsterArt:{...monster.projectVMonsterArt,primaryUrl:legacy,pngFallbackUrl:legacy}};
 assert.equal(monster.name,boss.name);for(const image of [monster.image,monster.image_url,monster.projectVMonsterArt.primaryUrl,monster.projectVMonsterArt.pngFallbackUrl])assert.equal(image,boss.image);
 const cards=Array.from({length:5},(_,i)=>({id:'CARD-'+i,title:'호위대 '+i,power:350000,power_type:'ATTACK'}));
 const run=m=>createPveBattleV2({cards,monster:m,seed:1832,escortObjective:{id:'ESCORT_OBJECTIVE',name:'장갑 수송차'}});
 const strip=v=>JSON.parse(JSON.stringify(v).replaceAll('보랏빛 공성술사','BOSS').replaceAll(boss.name,'BOSS').replaceAll(legacy,'ART').replaceAll(boss.image,'ART'));
 assert.deepEqual(strip(run(monster)),strip(run(old)));
});
