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

const usedA={round_id:15,side:'A',damage:390_000};
const blockedA=massAssaultPreview(round,front,{teamAName:'디임',teamBName:'조은',massAssaultDamagePercent:39},[usedA],'A');
assert.equal(blockedA.available,false);
assert.equal(blockedA.used,true);
assert.match(blockedA.reason,/디임팀.*이미 발동/);

const availableB=massAssaultPreview(round,front,{teamAName:'디임',teamBName:'조은',massAssaultDamagePercent:39},[usedA],'B');
assert.equal(availableB.available,true);
assert.equal(availableB.used,false);
assert.equal(availableB.side,'B');
assert.equal(availableB.targetSide,'A');
assert.equal(availableB.damage,390_000);

const centralRound={...round,current_front_index:4};
assert.equal(massAssaultPreview(centralRound,front,{massAssaultDamagePercent:39},[usedA],'B').available,true);

console.log('territory mass assault damage v1736: ok');
