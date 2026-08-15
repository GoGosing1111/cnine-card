import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url);
const server=readFileSync(new URL('functions/_scrapyard.js',root),'utf8');
const api=readFileSync(new URL('functions/api/[[path]].js',root),'utf8');
const app=readFileSync(new URL('js/app.js',root),'utf8');
const workshop=readFileSync(new URL('js/workshop-v1676.js',root),'utf8');
const battle=readFileSync(new URL('js/scrapyard-battle-v1698.js',root),'utf8');
const css=readFileSync(new URL('css/scrapyard-battle-v1698.css',root),'utf8');
const index=readFileSync(new URL('index.html',root),'utf8');

const assets=[
  'gearjaw-scavenger-v1698.webp','wrecklord-breaker-v1698.webp',
  'polarity-reclaimer-v1698.webp','hydraulic-titan-atlas-v1698.webp',
  'cindertrack-ravager-v1698.webp','furnace-sovereign-moloch-v1698.webp'
];
for(const name of assets)assert.equal(existsSync(fileURLToPath(new URL(`assets/ui/scrapyard/monsters/${name}`,root))),true,`${name} missing`);

assert.match(server,/const SCRAPYARD_ENEMIES=\{/);
assert.match(server,/OUTER:\{[\s\S]*gearjaw-scavenger-v1698\.webp[\s\S]*wrecklord-breaker-v1698\.webp/);
assert.match(server,/CORE:\{[\s\S]*polarity-reclaimer-v1698\.webp[\s\S]*hydraulic-titan-atlas-v1698\.webp/);
assert.match(server,/FURNACE:\{[\s\S]*cindertrack-ravager-v1698\.webp[\s\S]*furnace-sovereign-moloch-v1698\.webp/);
assert.doesNotMatch(server,/async function monsterPool/,'scrapyard should not query the shared PVE monster pool');
assert.match(server,/uniqueAbility:card\.uniqueAbility\|\|null/);
assert.match(server,/resolveUniqueBattleRuntime\(deck\.unique,\{mode:'PVE'/);
assert.match(server,/uniqueAbility:typeof deps\.uniqueBattleResponsePayload/);
assert.match(api,/resolveUnifiedDrops,resolveUniqueBattleRuntime,uniqueBattleResponsePayload/);

assert.match(app,/window\.SoopBattleFxV1698=\{fighterHtml:battleFighterHtml,playUnique:playUniqueBattleEventSequence,triggerUnique:battleTriggerUniqueFx,burst:battleBurst\}/);
assert.match(workshop,/window\.playScrapyardBattleV1698/);
assert.match(battle,/fx\.playUnique\(stage,phase,log,result\.uniqueAbility,cards,false\)/);
assert.match(battle,/class="ws76-monster battle-enemy-card"/);
assert.match(battle,/ws98-card-hp/);
assert.match(css,/\.ws98-battle \.unique-stage-fx/);
assert.match(index,/scrapyard-battle-v1698\.css\?v=1720-monster-card-compact/);
assert.match(index,/scrapyard-battle-v1698\.js\?v=1703-fast-entry/);

console.log('Scrapyard v1698: dedicated enemies, PVE unique runtime, shared effect playback, card HP UI and cache wiring verified');
