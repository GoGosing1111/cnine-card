import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {gsap} from 'gsap';
import {BattleHud, BATTLE_HUD_SIZE, fitBattleHudName} from '../preview/project-v-v3/source/battle/BattleHud.js';
after(() => gsap.ticker.sleep());

test('live health clamps, empties at KO, and restores on healing without resizing the frame', () => {
  const hud = new BattleHud({name:'구수댕',team:'ALLY'});
  const width = hud.frame.width;
  hud.setHp(25);
  assert.equal(hud.hpFill.width, hud.gauge.width * .25);
  hud.setHp(-100); assert.equal(hud.hp,0); assert.equal(hud.hpFill.visible,false);
  hud.setHp(135); assert.equal(hud.hp,100); assert.equal(hud.hpFill.visible,true);
  assert.equal(hud.hpFill.width,hud.gauge.width);
  assert.equal(hud.frame.width,width);
  hud.destroy({children:true});
});

test('shield follows its own maximum and disappears when broken without moving the health bar', () => {
  const hud = new BattleHud({name:'토마토',shield:30,maxShield:100});
  const y = hud.hpFill.y, width = hud.frame.width;
  assert.equal(hud.shieldFill.width,hud.gauge.width * .3);
  hud.setShield(0,100); assert.equal(hud.shieldFill.visible,false);
  hud.setShield(200,200); assert.equal(hud.shieldFill.width,hud.gauge.width);
  assert.equal(hud.hpFill.y,y); assert.equal(hud.frame.width,width);
  hud.destroy({children:true});
});

test('both factions keep the same compact size and distinct authored indicator tint', () => {
  const ally = new BattleHud({name:'아군',team:'ALLY'}), enemy = new BattleHud({name:'상대',team:'ENEMY'});
  for(const compact of [false,true,false]) {
    ally.setCompact(compact); enemy.setCompact(compact);
    assert.equal(ally.frame.width,enemy.frame.width);
    assert.equal(ally.frame.width,BATTLE_HUD_SIZE[compact?'compact':'desktop'].width);
    assert.equal(ally.nameLabel.scale.x,1);
  }
  assert.notEqual(ally.indicator.tint,enemy.indicator.tint);
  ally.destroy({children:true}); enemy.destroy({children:true});
});

test('long Korean, Latin and emoji names fit a fixed tab without splitting Unicode characters', () => {
  assert.equal(fitBattleHudName('베르칸',20,125),'베르칸');
  assert.equal(fitBattleHudName('나무늘봉순',20,125),'나무늘봉순');
  const long='🫐아주아주아주아주아주긴닉네임';
  const shown=fitBattleHudName(long,20,125);
  assert.ok(shown.endsWith('…')); assert.ok(shown.startsWith('🫐')); assert.ok(!shown.includes('�'));
  const hud=new BattleHud({name:'베르칸'}), width=hud.frame.width;
  hud.setName(long); assert.equal(hud.fullName,long); assert.equal(hud.frame.width,width);
  assert.notEqual(hud.nameLabel.text,long);
  hud.destroy({children:true});
});

test('dense defense mobs can hide the raised tab while retaining the B health channel', () => {
  const hud=new BattleHud({name:'몬스터',team:'ENEMY'});
  const {x,y,width}=hud.gauge;
  hud.setNameVisible(false);
  assert.equal(hud.nameLabel.visible,false);
  assert.deepEqual({x:hud.gauge.x,y:hud.gauge.y,width:hud.gauge.width},{x,y,width});
  hud.setNameVisible(true); assert.equal(hud.nameLabel.visible,true);
  hud.destroy({children:true});
});

