import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const server=readFileSync(new URL('functions/_drop_pool.js',root),'utf8');
const admin=readFileSync(new URL('admin/drop-pool-admin-v1667.js',root),'utf8');
const adminIndex=readFileSync(new URL('admin/index.html',root),'utf8');

assert.match(server,/SCRAPYARD_POOL_CODES=new Set/,'fixed scrapyard pool codes must be authoritative on the server');
assert.match(server,/VALUES\(\?,\?,\?,'INDEPENDENT',1,0,1,0,1\)/,'new scrapyard pools must use independent rates');
assert.match(server,/safe_runtime_upgrade_v1722_scrapyard_independent_drop_rates/,'existing pools need an idempotent independent-rate upgrade');
assert.match(server,/fixedPoolCount[\s\S]*SCRAPYARD_DIFFICULTIES\.length/,'upgrade marker must not be written for a partial scrapyard pool set');
assert.match(server,/SET roll_mode='INDEPENDENT',rolls=1,no_drop_weight=0,config_version=config_version\+1/,'upgrade must invalidate cached pool versions');
assert.match(server,/UPDATE \$\{ENTRY_TABLE\} SET weight=0,updated_at=CURRENT_TIMESTAMP WHERE pool_id IN/,'upgrade must clear obsolete scrapyard weights');
assert.match(server,/const mode=fixedScrapyard\?'INDEPENDENT'/,'CMS writes must not restore weighted mode');
assert.match(server,/fixedScrapyard\?\{\.\.\.entry,weight:0\}:entry/,'scrapyard weights must be normalized to zero');
assert.match(server,/effectivePool=fixedScrapyard\?\{\.\.\.pool,roll_mode:'INDEPENDENT',rolls:1,no_drop_weight:0\}:pool/,'runtime must enforce independent policy even during stale DB cache');
assert.match(server,/effectiveContext=fixedScrapyard\?\{\.\.\.context,rollsMultiplier:1\}:context/,'scrapyard completion must roll each reward once');
assert.match(server,/const random=seededRandom\(`\$\{uid\}:\$\{rid\}:\$\{pool\.id\}:\$\{pool\.config_version\}`\)/,'scrapyard retries must keep deterministic outcomes');
assert.match(server,/for\(const entry of enabled\)if\(random\(\)\*100<Math\.max\(0,Math\.min\(100,Number\(entry\.chance_percent\|\|0\)\)\)\)/,'independent mode must consume chance_percent directly');

assert.match(admin,/폐차장은 독립 확률만 사용/,'CMS must explain that relative weight is unused');
assert.match(admin,/fixedScrapyard\?'상대 가중치 · 미사용'/,'CMS must disable the misleading weight field');
assert.match(admin,/poolNoDropRate\(pool\)/,'CMS must calculate a real no-drop rate');
assert.match(admin,/rate\*\(1-poolEntryRate\(pool,entry\)\/100\)/,'independent no-drop rate must multiply every miss probability');
assert.match(admin,/전체 웨이브 완주 후 보상별 독립 확률 판정/,'CMS must describe the actual completion trigger');
assert.doesNotMatch(admin,/웨이브 클리어마다 차량 부품 드랍/,'legacy per-wave copy must not remain');
assert.match(adminIndex,/drop-pool-admin-v1667\.js\?v=1722-scrapyard-independent-rates/,'CMS asset cache key must be bumped');

const noDrop=chances=>chances.reduce((rate,chance)=>rate*(1-chance/100),1)*100;
assert.equal(Number(noDrop([10,5,3]).toFixed(4)),82.935,'10/5/3 must be three independent rolls');
assert.equal(noDrop([100,100]),0,'multiple guaranteed rewards must be able to drop together');

console.log('scrapyard independent drop rates v1722 verified');
