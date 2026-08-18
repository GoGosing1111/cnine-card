import assert from 'node:assert/strict';
import {massAssaultPreview} from '../functions/_territory_war.js';

const round={id:15,status:'ACTIVE',current_front_index:3};
const front={status:'ACTIVE',node_index:3,a_hp:1_000_000,b_hp:1_000_000,a_max_hp:1_000_000,b_max_hp:1_000_000};
const preview=massAssaultPreview(round,front,{teamAName:'엉덩이',teamBName:'가슴',massAssaultDamagePercent:39});

assert.equal(preview.percent,39);
assert.equal(preview.damage,390_000);
assert.equal(preview.hpAfter,610_000);
assert.equal(preview.side,'A');
assert.equal(preview.targetSide,'B');

const protectedHp=massAssaultPreview(round,{...front,b_hp:100_000},{massAssaultDamagePercent:39});
assert.equal(protectedHp.damage,99_999);
assert.equal(protectedHp.hpAfter,1);

console.log('territory mass assault damage v1736: ok');
