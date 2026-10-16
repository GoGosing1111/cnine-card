import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Container, Sprite} from 'pixi.js';
import {battleGroundStyle, BATTLE_GROUND_ASSETS} from '../preview/project-v-v3/source/battle/BattleGroundStyle.mjs';
import {createBattleGroundSigil} from '../preview/project-v-v3/source/battle/BattleGroundSigil.js';
import {withOccupiedGrid} from '../preview/project-v-v3/source/battle/OccupiedGridLayout.js';
import {petSupportPosition, petBattleDisplaySize} from '../preview/project-v-v3/source/battle/PetSupportLayout.mjs';
import {ALL_LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';

test('gold belongs only to ICON cards and SSS+ mercenaries, on both factions', () => {
  for (const team of ['ALLY','ENEMY']) {
    const ordinary = team === 'ALLY' ? 'ally' : 'enemy';
    for (const grade of ['N','R','SR','SSR','SS','SSS','FUR','ZENITH','SUPERSTAR',null])
      assert.equal(battleGroundStyle({battleCard:{grade}},'cards',team),ordinary,grade);
    assert.equal(battleGroundStyle({battleCard:{grade:'ICON'}},'cards',team),'icon');
    for (const rank of ['SSS','SSS+','SSSS']) {
      assert.equal(battleGroundStyle({mercenaryRow:{rank}},'mercenaries',team),'mercenary-sss');
      assert.equal(battleGroundStyle({mercenaryRow:{rank,edition:'LIMITED'}},'mercenaries',team),'mercenary-sss-limited');
    }
    assert.equal(battleGroundStyle({mercenaryRow:{rank:'SS',edition:'LIMITED'}},'mercenaries',team),ordinary);
  }
});

test('defense roster rank/kind and older limited snapshots select the same art', () => {
  const limited=ALL_LIMITED_MERCENARIES.find(row=>row.rank==='SSS');assert(limited);
  assert.equal(battleGroundStyle({battleCard:{kind:'CARD',rank:'ICON'}},'cards','ALLY'),'icon');
  assert.equal(battleGroundStyle({battleCard:{kind:'MERCENARY',rank:'SSS',code:limited.code}},'cards','ENEMY'),'mercenary-sss-limited');
  assert.equal(battleGroundStyle({battleCard:{kind:'MERCENARY',rank:'SSS',code:'V-055'}},'cards','ALLY'),'mercenary-sss');
});

test('ground uses dedicated images and keeps a faction edge around each golden variant', () => {
  for (const team of ['ALLY','ENEMY']) for (const [actor,style] of [
    [{battleCard:{grade:'ICON'}},'icon'],[{isMercenary:true,mercenaryRow:{rank:'SSS'}},'mercenary-sss'],
    [{isMercenary:true,mercenaryRow:{rank:'SSS',edition:'LIMITED'}},'mercenary-sss-limited']]) {
    const marker=createBattleGroundSigil({actor,team});
    assert.equal(marker.groundStyle,style);assert.equal(marker.children.length,2);
    assert(marker.children.every(child=>child instanceof Sprite));
    assert.equal(marker.children[0].label,'RuneImage:'+(team==='ALLY'?'ally':'enemy'));
    marker.destroy({children:true});
  }
});

test('same occupied slot refreshes its grade art without per-frame recreation or moving with attacks', () => {
  class Harness {
    constructor(){this.allies=[{id:'a',hp:100,battleActive:true,battleCard:{grade:'FUR'},stateHalo:new Container()}];this.enemies=[];this.characters=this.allies;this.isoFloorLayer=new Container();}
    sortCombatDepth(){}
  }
  const Engine=withOccupiedGrid(Harness),engine=new Engine();engine.configureIsometricScene();engine.drawIsometricFloor();
  const first=engine.isoTiles[0],position={x:first.x,y:first.y};assert.equal(first.groundStyle,'ally');
  engine.allies[0].battleCard={grade:'ICON'};engine.sortCombatDepth();
  const gold=engine.isoTiles[0];assert.notEqual(gold,first);assert(first.destroyed);assert.equal(gold.groundStyle,'icon');
  engine.allies[0].baseX=900;engine.sortCombatDepth();assert.equal(engine.isoTiles[0],gold);assert.deepEqual({x:gold.x,y:gold.y},position);
  assert.equal(engine.allies[0].stateHalo.visible,false,'no duplicate legacy ellipse');
  engine.allies[0].hp=0;engine.sortCombatDepth();assert.equal(engine.isoTiles.length,0);
  engine.isoFloorLayer.destroy({children:true});engine.allies[0].stateHalo.destroy();
});

test('pet reduction is exactly 20% after portrait minima and neighboring-card fit, for both sides', () => {
  for (const side of ['A','B']) for(const scale of [.3,.55,1]) for(const pvp of [false,true]) {
    const size=Math.max(126,56/scale),position=petSupportPosition({points:[{x:140,y:857},{x:356,y:857}],side,pvp,
      suit:{x:356,y:857,halfWidth:95},width:1080,height:1240,scale,size});
    const display=petBattleDisplaySize(position.size);
    assert(Math.abs(display/position.size-.8)<1e-12);
    if(!pvp&&side==='A')assert(display<=129.6*.8,'neighbor fit must not undo the reduction');
  }
});

test('all five runtime assets preserve their generated originals and transparent export records', () => {
  const root=new URL('../assets/ui/project-v/battle-ground-runes-v1/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
  assert.equal(manifest.assets.length,5);
  for(const row of manifest.assets){
    assert(row.prompt.length>100);assert.deepEqual(row.alphaCheck,{center:0,corner:0});
    for(const [file,expected]of [[row.source,row.sha256],[row.runtime,row.runtimeSha256]])
      assert.equal(createHash('sha256').update(readFileSync(new URL(file,root))).digest('hex'),expected);
    assert(BATTLE_GROUND_ASSETS[row.name].endsWith(row.runtime));
  }
});
