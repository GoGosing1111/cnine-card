import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const manifest=JSON.parse(fs.readFileSync('assets/ui/project-v/monsters/hunt-tower/manifest-v1.json','utf8'));
const rows=new Map(manifest.sprites.map(row=>[row.monsterId,row]));
for(const id of [63,64]){
  const row=rows.get(id);assert(row,`monster ${id} manifest 누락`);
  for(const [pathKey,hashKey] of [['battleSprite','sha256'],['battleSpriteWebp','battleSpriteWebpSha256']]){
    assert(fs.existsSync(row[pathKey]),`${id} ${pathKey} 누락`);
    const hash=crypto.createHash('sha256').update(fs.readFileSync(row[pathKey])).digest('hex').toUpperCase();
    assert.equal(hash,row[hashKey],`${id} ${pathKey} hash 불일치`);
  }
  assert.equal(row.qa.technicalPass,true);
  assert.equal(row.qa.visualApproval,true);
}
assert.equal(rows.get(64).name,'커맨더 크리그');
assert.equal(rows.get(64).mode,'TOWER');
assert.equal(rows.get(64).sourceArt,'assets/tower/dad.jpg');

const source=fs.readFileSync('js/project-v-monster-battle-art-adapter-v1.js','utf8');
const sandbox={console,setTimeout:fn=>fn(),globalThis:null};sandbox.globalThis=sandbox;
vm.runInNewContext(source,sandbox);
const adapter=sandbox.ProjectVMonsterBattleArt.createAdapter({manifest});
assert.match(adapter.resolveForV3({id:63,mode:'HUNT'}).primaryUrl,/hunt-063-solar-lion-king/);
assert.match(adapter.resolveForV3({id:64,mode:'TOWER'}).primaryUrl,/tower-064-commander-krieg/);
assert.equal(adapter.resolveForV3({id:64,mode:'HUNT'}),null,'TOWER 전용 크리그가 HUNT에 연결됐습니다.');
assert.match(source,/manifest-v1\.json\?v=5-krieg-escanor-fix/);

console.log('project-v monster 63/64: Escanor alpha fix + Commander Krieg V3 binding PASS');
