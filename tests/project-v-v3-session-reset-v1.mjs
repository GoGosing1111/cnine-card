import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
assert.match(live,/const VERSION = '3\.36\.0-combat-flow'/);
assert.match(live,/ProjectVPixiBattle\.cancelActiveAnimations/);
assert.match(live,/ProjectVPixiBattle\.syncFinalState\(finalState\)/);
assert.match(app,/project-v-pixi-battle\.bundle\.js\?v=106-combat-flow/);
assert.match(app,/battle-v3-live\.js\?v=3\.36\.0-combat-flow/);

// Simulate a cold mount exceeding the watchdog and completing after a second
// instance is ready. Neither its success nor its failure may replace/destroy
// the current renderer.
for(const lateFailure of [false,true]){
  const instances=[];let release;
  class FakeEngine{
    constructor(){this.index=instances.length;instances.push(this);}
    setAccountBattleUnitPreviewFireHook(){}
    async mount(){if(!this.index)await new Promise((resolve,reject)=>{release=()=>lateFailure?reject(Error('late decode failure')):resolve();});this.mounted=true;return this;}
    destroy(){this.destroyed=true;}
    diagnostics(){return {index:this.index,destroyed:Boolean(this.destroyed),mounted:this.mounted};}
  }
  const window={},context={window,document:{getElementById:()=>({})},BattleEngine:FakeEngine,ExpeditionBattleEngine:FakeEngine};
  vm.runInNewContext(entry.replace(/^import .*;\r?$/gm,'').replace(/^export .*;\r?$/gm,''),context);
  const api=window.ProjectVPixiBattle,old=api.mountForBattle({}).then(()=>null,error=>error);
  api.destroy();const replacement=await api.mountForBattle({});release();
  assert.ok(await old,'the cancelled first initialization must reject');
  assert.equal(api.diagnostics().index,1);assert.equal(replacement.destroyed,undefined);
  api.destroy();
}

console.log('Project V V3 session reset contract: OK');
