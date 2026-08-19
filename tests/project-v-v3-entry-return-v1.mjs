import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const engine=fs.readFileSync(new URL('../preview/project-v-v3/source/battle/BattleEngine.js',import.meta.url),'utf8');
const timeline=fs.readFileSync(new URL('../preview/project-v-v3/source/battle/SkillTimeline.js',import.meta.url),'utf8');
const v2=fs.readFileSync(new URL('../js/battle-v2-live.js',import.meta.url),'utf8');
const v3=fs.readFileSync(new URL('../js/battle-v3-live.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../functions/_battle_v2_preview.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

for(const [name,source] of [['V2 bridge',v2],['V3 bridge',v3],['Pixi engine',engine]]){
  assert.match(source,/PLAYBACK_SPEED\s*=\s*1\.3/,`${name} must use the 1.3x clock`);
}
assert.equal((api.match(/playbackSpeed:\s*1\.3/g)||[]).length,3,'PVE, PVP and preview payloads must advertise 1.3x');
assert.match(timeline,/playbackSpeed=1\.3/,'skill timeline default must use 1.3x');
assert.match(timeline,/function setCardCutInArt/,'the cut-in must have an original-card layout path');
assert.match(timeline,/Math\.min\(\(width\*\.96\)\/sprite\.texture\.width,\(height\*\.96\)\/sprite\.texture\.height\)/,'the complete original card must remain visible');

const sourceArtIndex=engine.indexOf('art?.sourceArtUrl');
const runtimeImageIndex=engine.indexOf('card?.imageUrl',sourceArtIndex);
assert.ok(sourceArtIndex>=0&&runtimeImageIndex>sourceArtIndex,'manifest source art must win over the runtime SD image');
assert.doesNotMatch(engine,/const advance=86/,'normal attacks must not stay near their origin tile');
assert.match(engine,/x:victimView\.x-vector\.x\/distance\*stopDistance/,'each TURN must dash to the selected target');
assert.match(engine,/const stopDistance=isBossTarget\?138:92/,'boss and card collision spacing must be explicit');

const start=app.indexOf('async function startBattle()');
const immediate=app.indexOf('prepareImmediateBattleV3Entry',start);
const resource=app.indexOf("await ensureFeatureResources('battleV2')",start);
const fight=app.indexOf("apiRequest('battle/fight'",start);
assert.ok(start>=0&&immediate>start&&resource>immediate&&fight>resource,'PVE must show the V3 battlefield before resource/API waiting');
assert.match(app,/script\.async=false/,'feature scripts must preserve execution order');
assert.match(app,/Promise\.all\(\(manifest\.scripts\|\|\[\]\)\.map\(loadFeatureScript\)\)/,'feature downloads must start in parallel');
assert.match(index,/css\/battle-v3-live\.css\?v=3\.4\.0-card-cutin-1-3x/,'the instant V3 shell CSS must be available before lazy scripts');

assert.match(app,/function renderBattleSnapshot\(\)/,'PVE must retain the last valid monster/deck snapshot');
assert.match(app,/retryDelays=\[0,260,680,1350\]/,'battle config retry must be fast and bounded');
assert.match(app,/battleViewRetryTimer=setTimeout\([\s\S]*loadBattleView\(\)/,'a transient config read must recover without a page refresh');
assert.doesNotMatch(app,/setTimeout\([\s\S]{0,100}15000[\s\S]{0,100}loadBattleView/,'PVE recovery must not use the rejected 15-second delay');

console.log('project-v-v3 entry/return/card-cut-in contract: OK');
