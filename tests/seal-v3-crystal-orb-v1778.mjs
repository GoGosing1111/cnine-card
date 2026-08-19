import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = value => fs.readFileSync(path.join(root, value));
const text = value => read(value).toString('utf8');
const master = read('assets/ui/project-v/monsters/seal-crystal-orb-sd-v1.png');

assert.equal(master.toString('ascii', 1, 4), 'PNG');
assert.equal(master.readUInt32BE(16), 1536);
assert.equal(master.readUInt32BE(20), 1536);
assert.equal(master[25], 6, '봉인 수정구는 true RGBA PNG여야 합니다.');
for (const file of [
  'assets/responsive/project-v/monsters/seal-crystal-orb-sd-v1-384.avif',
  'assets/responsive/project-v/monsters/seal-crystal-orb-sd-v1-384.webp',
  'assets/responsive/project-v/monsters/seal-crystal-orb-sd-v1-768.avif',
  'assets/responsive/project-v/monsters/seal-crystal-orb-sd-v1-768.webp'
]) assert.ok(read(file).length > 1000, `${file} 누락`);

const v3 = text('js/battle-v3-live.js');
const seal = text('js/seal-battle.js');
assert.match(v3, /function sealPayload/);
assert.match(v3, /root\.playSealBattleV3Live = playSeal/);
assert.match(v3, /playUltimateCinematics: false/);
assert.match(v3, /projectVMonsterArt:/);
assert.match(v3, /SEAL_CRYSTAL_ORB_SD/);
assert.match(seal, /ensureFeatureResources\('battleV2'\)/);
assert.match(seal, /playSealBattleV3Live/);
assert.match(seal, /SEAL_ORB_IMAGE/);
assert.doesNotMatch(seal, /const bossImage = source\(event\.bossImage/);

console.log('seal V3 crystal orb contract: OK');
