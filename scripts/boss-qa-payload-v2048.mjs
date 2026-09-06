// Static, read-only QA fixtures: actual catalog identities/source art and the
// production server simulator. This never calls an API or spends player items.
import {readFile,writeFile} from 'node:fs/promises';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {pveDifficultyRuntime} from '../functions/_pve_nightmare.js';
import {buildCoreRaidBattlePayload} from '../functions/_raid_core_protocol.js';
const json=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const manifests=await Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(file=>json('assets/ui/project-v/characters/'+file)));
const roster=manifests.flatMap(manifest=>manifest.characters.map(card=>({...card,grade:manifest.rarity})));
const ids=['CN-346F8DB0DEB84D41','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const cards=ids.map((id,i)=>{
  const card=roster.find(row=>row.cardId===id);if(!card)throw new Error('Unknown QA identity: '+id);
  return {...card,id,cardId:id,name:card.member,rarity:card.grade,image:card.sourceArt,image_url:card.sourceArt,originalCardArt:card.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','DEFENSE'][i],power:400000};
});
const monsters=(await json('assets/ui/project-v/monsters/hunt-tower/manifest-v1.json')).sprites;
const fixtures={};
for(const id of [73,74]){
  const art=monsters.find(row=>row.monsterId===id);if(!art)throw new Error('Missing SD manifest: '+id);
  const runtime=pveDifficultyRuntime({apocalypse:{monsterProfiles:{[id]:{battlePower:id===73?3000000:4500000,rewardCoin:500000,hpPercent:350,attackPercent:475,defensePercent:375,speedPercent:375,shieldPercent:id===73?60:70}}}},{id,name:art.name,image:art.sourceArt,image_url:art.sourceArt,pveTab:'APOCALYPSE',is_boss:1});
  fixtures[id]={previewOnly:true,networkPolicy:'STATIC_GET_ONLY',mode:'APOCALYPSE',battlefieldMode:'APOCALYPSE',difficulty:runtime,monster:runtime.engineMonster,bossUltimate:{...runtime.apocalypseSkill,apocalypseExclusive:true},accountNickname:'보스 리소스 검수',battleV2:createPveBattleV2({cards,monster:runtime.engineMonster,bossUltimatePercent:runtime.apocalypseSkill.damagePercent,bossUltimateCapPercent:runtime.bossUltimateCapPercent,seed:2048})};
}
fixtures.yhwach={previewOnly:true,networkPolicy:'STATIC_GET_ONLY',...buildCoreRaidBattlePayload({participant:{room_id:'LOCAL-QA',attempt_id:'LOCAL-QA',stage:'BOSS',operation:'FINAL',user_id:0,total_power:2000000,deck_snapshot:JSON.stringify({cards,power:2000000,cardPower:2000000}),challenge_json:JSON.stringify({challengeId:'LOCAL-QA',weaknessCycle:['ATTACK','DEFENSE'],sequence:['UP','RIGHT'],sequenceWindowMs:5500,mashTarget:10,mashWindowMs:5000})},createBattle:createPveBattleV2})};
await writeFile(new URL('../preview/boss-resources-v2048/payloads.json',import.meta.url),JSON.stringify(fixtures));
console.log(JSON.stringify(Object.fromEntries(Object.entries(fixtures).map(([key,value])=>[key,{cards:value.battleV2.teams.A.cards.length,boss:value.battleV2.teams.B.cards[0].name,events:value.battleV2.result.timeline.length}]))));
