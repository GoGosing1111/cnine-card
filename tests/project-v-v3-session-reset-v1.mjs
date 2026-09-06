import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const engine=read('preview/project-v-v3/source/battle/BattleEngine.js');
const entry=read('preview/project-v-v3/source/project-v-pixi-battle.src.js');
const bundle=read('preview/project-v-v3/project-v-pixi-battle.bundle.js');
const live=read('js/battle-v3-live.js');
const app=read('js/app.js');

assert.match(engine,/async resetSession\(payload=this\.battleData,target=null\)/);
assert.match(engine,/this\.resetVisualSession\(\);[\s\S]*await this\.setBattlePayload\(payload\);[\s\S]*this\.resetVisualSession\(\{preserveTargets:true\}\)/);
assert.match(engine,/character\.root\.filters=\[\]/);
assert.match(engine,/character\.setState\(CHARACTER_STATE\.IDLE\)/);
assert.match(engine,/character\.setHp\(100\)/);
assert.match(entry,/engine\.resetSession\(payload,target\)/);
assert.ok((bundle.match(/resetSession/g)||[]).length>=3,'bundle must contain engine + public resetSession contracts');
assert.match(live,/ProjectVPixiBattle\.resetSession\(payload, host\)/);
assert.match(live,/const VERSION = '3\.31\.0-skill-chip-runtime'/);
assert.match(live,/ProjectVPixiBattle\.cancelActiveAnimations/);
assert.match(live,/ProjectVPixiBattle\.syncFinalState\(finalState\)/);
assert.match(app,/project-v-pixi-battle\.bundle\.js\?v=100-boss-signatures/);
assert.match(app,/battle-v3-live\.js\?v=3\.31\.0-skill-chip-runtime/);

console.log('Project V V3 session reset contract: OK');
