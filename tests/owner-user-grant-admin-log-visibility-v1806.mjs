import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');

assert.match(api,/const USER_GRANT_LOG_HIDDEN_NICKNAME='핑크빛유두'/);
assert.match(api,/const USER_GRANT_ADMIN_ACTIONS=Object\.freeze\(\[/);
for(const action of ['COIN','COIN_GRANT','SHARDS','INVENTORY','MASTER_STAR_ADJUST','MAGIC_CRYSTAL_ADJUST','USER_CARD_MANUAL_GRANT','LIMITED_MANUAL_GRANT']){
  assert.match(api,new RegExp(`['"]${action}['"]`));
}
assert.match(api,/TRIM\(COALESCE\(u\.nickname,''\)\)=\?/);
assert.match(api,/\.bind\(USER_GRANT_LOG_HIDDEN_NICKNAME,\.\.\.USER_GRANT_ADMIN_ACTIONS\)/);
assert.doesNotMatch(api,/USER_GRANT_LOG_HIDDEN_(ROLE|ROLES)/);

console.log('핑크빛유두 계정의 유저 지급 기록만 CMS 관리자 기록에서 제외됨');
