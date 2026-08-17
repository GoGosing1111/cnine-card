import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const api=readFileSync(new URL('functions/api/[[path]].js',root),'utf8');
const app=readFileSync(new URL('js/app.js',root),'utf8');
const index=readFileSync(new URL('index.html',root),'utf8');

for(const source of [api,app]){
  assert.match(source,/FAKER_CHAMPIONSHIP_CARD_ID\s*=\s*['"]CN-0B48C6FF8F9B4AC5['"]/);
  assert.match(source,/FAKER_FLAT_POWER_BONUS\s*=\s*3000/);
  assert.match(source,/grade==='FUR'&&cardId===FAKER_CHAMPIONSHIP_CARD_ID\?FAKER_FLAT_POWER_BONUS:0/);
  assert.match(source,/return power\+specialBonus/,'Faker bonus must be flat after breakthrough scaling');
}

assert.match(api,/SELECT c\.id,c\.rarity,c\.power_type,c\.base_power,uc\.breakthrough_level FROM user_cards/);
assert.match(api,/SELECT d\.user_id,c\.id,c\.rarity,c\.power_type,c\.base_power,uc\.breakthrough_level/);
assert.match(api,/c\.id AS card_id,c\.rarity/);
assert.match(api,/SELECT u\.nickname,c\.id,c\.rarity/);
assert.match(index,/js\/app\.js\?v=1727-partial-shell-render/);

const flat=(base,percent,isFaker)=>Math.floor(base*(1+percent/100))+(isFaker?3000:0);
assert.equal(flat(3200,0,true),6200);
assert.equal(flat(3200,450,true),20600);
assert.equal(flat(3200,600,true),25400);
assert.equal(flat(3200,450,false),17600);

console.log('FUR Faker flat power bonus v1720 ok');
