import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const paths={
  FUR:'assets/ui/project-v/characters/fur/manifest-v2.json',
  PRESTIGE:'assets/ui/project-v/characters/prestige/manifest-v1.json',
  SUPERSTAR:'assets/ui/project-v/characters/superstar/manifest-v1.json'
};
const manifests=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,JSON.parse(fs.readFileSync(path,'utf8'))]));
assert.equal(manifests.FUR.characters.length,14);
assert.equal(manifests.PRESTIGE.characters.length,28);
assert.equal(manifests.SUPERSTAR.characters.length,6);
const all=[...manifests.FUR.characters,...manifests.PRESTIGE.characters,...manifests.SUPERSTAR.characters];
assert.equal(new Set(all.map(row=>row.cardId)).size,48);
for(const row of all){
  assert.ok(fs.existsSync(row.battleSprite),`missing ${row.battleSprite}`);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(row.battleSprite)).digest('hex').toUpperCase(),row.sha256);
}

const source=fs.readFileSync('js/project-v-tier-battle-art-adapter-v1.js','utf8');
const sandbox={console,setTimeout:fn=>fn(),globalThis:null};
sandbox.globalThis=sandbox;
vm.runInNewContext(source,sandbox);
const adapter=sandbox.ProjectVTierBattleArt.createAdapter({manifests});
await adapter.ready();
assert.equal(adapter.getMappedCardIds().length,48);
const fur=adapter.resolveForV3({cardId:'CN-0B48C6FF8F9B4AC5',grade:'FUR'});
const prestige=adapter.resolveForV3({cardId:'CN-FE742947CBD14B74',grade:'PRESTIGE'});
const prestigeNew=adapter.resolveForV3({cardId:'CN-7D9F82B5283044B8',grade:'PRESTIGE'});
const superstar=adapter.resolveForV3({cardId:'CN-48BBCAC81D0E44FA',grade:'SUPERSTAR'});
assert.match(fur.primaryUrl,/characters\/fur\/fur-cn-0b48/);
assert.match(prestige.primaryUrl,/characters\/prestige\/prestige-kim-taekyong/);
assert.match(prestigeNew.primaryUrl,/characters\/prestige\/prestige-cn-7d9f82b5283044b8/);
assert.match(superstar.primaryUrl,/characters\/superstar\/superstar-cn-48bbcac81d0e44fa/);
assert.equal(superstar.kind,'SUPERSTAR_SD');
assert.equal(adapter.resolveForV3({cardId:'CN-FE742947CBD14B74',grade:'FUR'}),null,'등급 불일치가 매핑됐습니다.');
const payload={battleV2:{teams:{A:{cards:[{cardId:'CN-FE742947CBD14B74',grade:'PRESTIGE'}]},B:{cards:[]}}}};
const adapted=adapter.adaptBattlePayload(payload);
assert.match(adapted.battleV2.teams.A.cards[0].image,/prestige-kim-taekyong/);
assert.equal(payload.battleV2.teams.A.cards[0].image,undefined,'원본 payload mutation');

if(fs.existsSync('tmp/project-v-battle-modules/battle/BattleEngine.js')){
  const engine=fs.readFileSync('tmp/project-v-battle-modules/battle/BattleEngine.js','utf8');
  assert.match(engine,/zenithAdapter\?\.resolveForBattle/);
  assert.match(engine,/tierAdapter\?\.resolveForV3/);
}
if(fs.existsSync('tmp/project-v-index.html')){
  const preview=fs.readFileSync('tmp/project-v-index.html','utf8');
  assert.match(preview,/project-v-battle-art-adapter-v1\.js[\s\S]*project-v-tier-battle-art-adapter-v1\.js[\s\S]*project-v-unassigned-battle-fallback-v1\.js/);
}
console.log('project-v FUR/PRESTIGE/SUPERSTAR battle art adapter: OK');
