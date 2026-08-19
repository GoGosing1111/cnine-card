import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const engine=read('preview/project-v-v3/source/battle/BattleEngine.js');
const entry=read('preview/project-v-v3/source/project-v-pixi-battle.src.js');
const html=read('preview/project-v-v3/index.html');

assert.match(engine,/isAlive\(character\)/,'engine needs a single authoritative alive check');
assert.match(engine,/filter\(character=>this\.isAlive\(character\)\)/,'dead targets must be excluded from candidate selection');
assert.match(engine,/selectLiveTarget\(attacker,preferred=null\)/,'all attacks need the shared target selector');
assert.match(engine,/if\(hp<=0\)\{\s*this\.currentEnemyTarget=null;/,'zero HP must invalidate the current enemy target');
assert.match(engine,/this\.selectLiveTarget\(this\.allies\.find/,'zero HP must trigger immediate reselection');
assert.match(engine,/const target=this\.combatantById\(event\.targetId\)\|\|null/,'server event targetId must be supported');
assert.match(engine,/targetHp=hasFiniteNumber\(event\.targetHp\)/,'server event targetHp must be supported without null coercion');
assert.match(engine,/\{type:'ULTIMATE'.*targetHp:0\}[\s\S]*\{type:'ATTACK'.*targetHp:78\}/,'demo must visibly attack again after a kill');
assert.match(engine,/async verifyTargetSwitch\(\)/,'explicit target-switch verification must remain available');
assert.match(entry,/verifyTargetSwitch/,'public V3 API must expose target-switch verification');
assert.match(html,/id="pvBattleRetarget"/,'preview must include the target-switch verification control');

console.log('project-v V3 target reselection contract: OK');
