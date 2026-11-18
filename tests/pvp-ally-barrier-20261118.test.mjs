import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryDamageCapHp} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
const unit=(id,side,power)=>buildFighter({id,rarity:'ZENITH',power_type:'ATTACK',power},0,side,null,'PVP');
test('small PVP card with a large allied barrier takes real damage and dies before overtime',()=>{
 const a=unit('attack','A',5000000),b=unit('barrier','B',1000);
 b.shield=b.maxShield=94079518;b.speed=1;a.speed=1000;
 const result=simulateBattleV2Preview({teamA:[a],teamB:[b],seed:42,maxActions:50,suddenDeathAfter:0,petMode:'PVP'});
 assert.equal(result.final.B[0].hp,0);assert.equal(result.final.B[0].shield,0);
 assert(result.actions<50);assert(result.timeline.some(e=>e.type==='KO'&&e.targetId===b.id));
});
test('cap follows remaining shield, never historic maxShield; ordinary wards and PVE retain HP basis',()=>{
 const card=unit('card','A',10000),hp=mercenaryDamageCapHp(card);
 assert.equal(mercenaryDamageCapHp({...card,shield:hp/2,maxShield:hp*1000}),hp);
 assert.equal(mercenaryDamageCapHp({...card,shield:hp*1000}),hp*1000);
 assert.equal(mercenaryDamageCapHp({...card,shield:0,maxShield:hp*1000}),hp);
 for(const mode of ['PVE','RAID'])assert.equal(mercenaryDamageCapHp({...card,battleMode:mode,shield:hp*1000}),hp);
 assert.equal(mercenaryDamageCapHp({...card,isMonster:true,shield:hp*1000}),hp);
 const merc={...card,isMercenary:true,mercenaryLink:{openingShield:hp*2,tierGuard:2}};
 assert.equal(mercenaryDamageCapHp({...merc,shield:hp*1000}),mercenaryDamageCapHp({...merc,shield:0}));
});
