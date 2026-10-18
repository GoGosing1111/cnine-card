import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleCharacter, TEAM, CHARACTER_STATE} from '../preview/project-v-v3/source/battle/BattleCharacter.js';
import {BattleAnimation} from '../preview/project-v-v3/source/battle/BattleAnimation.js';
import {BATTLE_HUD_SIZE} from '../preview/project-v-v3/source/battle/BattleHud.js';
import {CAPACITY, crowdPosition} from '../preview/sustained-hunt-v2/hunt-rules.mjs';
after(() => gsap.ticker.sleep());

// Exercise the real encounter bind, Hunt layout, actor and B HUD together.
// The unrelated scene base only supplies the shared per-frame perspective reset.
const source = file => fs.readFileSync(file,'utf8').replace(/^import .*;$/gm,'').replace('export class BattleEngine','class BattleEngine');
class SceneBase {
  layoutCharacterGrid() {for (const a of this.enemies) a.setCompactHud(this.mobile);}
  sortCombatDepth() {for (const a of this.enemies) a.updatePerspective(.5);}
}
const Parent = vm.runInNewContext(source('preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js')+';BattleEngine', {LiveBattleEngine:SceneBase, CHARACTER_STATE});
const Hunt = vm.runInNewContext(source('preview/sustained-hunt-v2/source/HuntBattleEngine.js')+';BattleEngine', {ScrapyardEngine:Parent, BattleAnimation, BATTLE_HUD_SIZE, gsap, CAPACITY, crowdPosition});
function fixture() {
  const e=Object.create(Hunt.prototype);
  Object.assign(e,{mobile:false,instances:new Map(),retiredIds:new Set(),spawnCount:0,spriteTextures:new Map([['qa',Texture.WHITE]]),settlePendingTails(){},huntRegionBackground:'/assets/ui/legion-regions-v1/coast/background-v1.webp'});
  e.enemies=Array.from({length:CAPACITY},(_,slot)=>new BattleCharacter({id:'placeholder-'+slot,name:'심연 슬라임',team:TEAM.ENEMY,texture:Texture.WHITE,fullBodyTexture:Texture.WHITE,fullBodyHeight:245}));
  const bind=(slot,extra={})=>{
    const row={id:'B:ENCOUNTER:'+e.spawnCount,slot,name:'작살게',displayName:'작살게',battleSprite:'qa',battleHeight:245,maxHp:100,...extra};
    e.instances.set(row.id,row);const a=e.bindMonster(row);a.animationAdapter.kill();return a;
  };
  for(let i=0;i<CAPACITY;i++)bind(i);
  e.layoutCharacterGrid();
  return {e,bind,dispose(){for(const a of e.enemies){a.animationAdapter.kill();a.root.destroy({children:true});}}};
}

test('all twelve slots retain framed health, actual names and consistent responsive sizing',()=>{
  const f=fixture(),{e}=f;
  try {
    e.enemies[1].isBoss=true; // Generic first mount must not change this row's role.
    for(const mobile of [false,true,false]) {
      e.mobile=mobile;e.viewportFit=mobile?{}:null;e.layoutCharacterGrid();e.sortCombatDepth();
      for(const a of e.enemies) {
        assert.equal(a.hud.frame.visible,true);assert.equal(a.hud.showName,false);
        assert.equal(a.nameLabel.visible,false);assert.equal(a.hud.fullName,'작살게');
        assert.equal(a.hud.compact,mobile);assert.equal(a.hud.scale.x,e.enemies[0].hud.scale.x);
        a.setHp(25);assert.equal(a.hud.hpFill.width,a.hud.gauge.width*.25);
      }
    }
  } finally {f.dispose();}
});

test('boss/elite/normal respawns replace height and name, including repeated long names',()=>{
  const f=fixture(),{e,bind}=f;
  try {
    for(const mobile of [true,false]) {
      e.mobile=mobile;e.viewportFit=mobile?{}:null;e.layoutCharacterGrid();
      for(const variant of [
        {boss:true,battleHeight:410,name:'태양을 삼킨 전갈'},
        {boss:true,battleHeight:410,name:'태양을 삼킨 전갈'},
        {elite:true,battleHeight:265,name:'정예 칼지느러미 어인'},
        {boss:false,elite:false,battleHeight:245,name:'작살게'}
      ]) {
        const a=bind(11,{...variant,displayName:variant.name});
        a.setHp(37);a.setShield(25,100);e.sortCombatDepth();
        assert.equal(a.hud.fullName,variant.name);
        assert.equal(a.hud.showName,Boolean(variant.boss||variant.elite));
        assert.equal(a.hud.y,a.formationHudY);assert.equal(a.hud.scale.x,a.huntHudScale);
        assert.equal(a.hud.hp,37);assert.equal(a.hud.shieldFill.width,a.hud.gauge.width*.25);
        if(variant.boss)assert.ok(a.nameLabel.text.endsWith('…'));
        assert.equal(a.view.rotation,0);
      }
    }
  } finally {f.dispose();}
});

test('stationary enemy HUDs stay above their own head and apart in every row',()=>{
  const f=fixture(),{e}=f;
  try {
    for(const mobile of [false,true]) {
      e.mobile=mobile;e.viewportFit=mobile?{}:null;e.layoutCharacterGrid();e.sortCombatDepth();
      for(let slot=0;slot<CAPACITY;slot++) {
        const a=e.enemies[slot],b=a.hud.frame.getBounds();
        assert.ok(b.maxY<a.baseY-a.fullBodyHeight*.98*a.designScale);
        assert.ok(Math.abs((b.minX+b.maxX)/2-a.baseX)<.01);
        if(slot%3<2)assert.ok(b.maxX<e.enemies[slot+1].hud.frame.getBounds().minX);
      }
    }
  } finally {f.dispose();}
});
