import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createPlaydkIdentityClient} from '../functions/_playdk_client.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [api,app,migration,index,worker,css,admin,adminIndex]=await Promise.all([
  read('functions/api/[[path]].js'),read('js/app.js'),read('database/migrations/0080_v1780_secondary_verification.sql'),
  read('index.html'),read('service-worker.js'),read('css/secondary-verification-v1780.css'),read('admin/admin-v1276.js'),read('admin/index.html')
]);

assert.match(api,/path==='secondary-verification\/status'/);
assert.match(api,/path==='secondary-verification\/playdk'/);
assert.match(api,/playdkIdentityClient\(env\)\.getUserInfo\(token\)/);
assert.match(api,/\['playdk\.kr','www\.playdk\.kr'\]\.includes/);
assert.match(api,/path==='admin\/secondary-verifications'/);
assert.match(api,/SELECT s\.user_id,'ADMIN'/);
assert.match(api,/s\.provider AS verification_provider/);
assert.match(api,/SECONDARY_VERIFICATION_PROVIDER_CONFLICT/);
assert.doesNotMatch(api,/path==='auth\/playdk'/);
const playdkRoute=api.slice(api.indexOf("path==='secondary-verification/playdk'"),api.indexOf("path==='wago-verification/status'"));
assert.doesNotMatch(playdkRoute,/makeSession|auth\/register|INSERT INTO users/);
assert.match(app,/startupUrl\.searchParams\.delete\('token'\)/);
assert.match(app,/secondary-verification\/playdk/);
assert.match(app,/PLAY DK 닉네임 등록/);
assert.match(app,/한 숲켓몬 계정에는 하나의 2차 인증만 연결/);
assert.match(index,/secondary-verification-v1780\.css\?v=1799-playdk-only/);
assert.match(index,/app\.js\?v=1804-playdk-daily-bgm-mute/);
assert.match(worker,/soop-card-shell-v1804-playdk-daily-bgm-mute/);
assert.match(css,/@media \(max-width: 430px\)/);
assert.match(css,/min-height: 44px/);
assert.match(admin,/2차 인증 연결 현황/);
assert.match(admin,/admin\/secondary-verifications/);
assert.match(admin,/data-secondary-unlink/);
assert.match(admin,/PLAY DK SECONDARY LINK/);
assert.match(adminIndex,/admin-v1276\.js\?v=1804-playdk-daily/);

const db=new DatabaseSync(':memory:');
db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT);
  CREATE TABLE wago_verifications(
    id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL UNIQUE,wago_nickname TEXT,wago_member_no TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',verified_at TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO users VALUES(1,'alpha'),(2,'beta'),(3,'gamma');
  INSERT INTO wago_verifications(user_id,wago_nickname,wago_member_no,status) VALUES(1,'wago-a','101','PENDING'),(2,'wago-b','202','PENDING');
`);
db.exec(migration);
db.exec("UPDATE wago_verifications SET status='VERIFIED',verified_at=CURRENT_TIMESTAMP WHERE user_id=1");
assert.equal(db.prepare('SELECT provider FROM user_second_verifications WHERE user_id=1').get().provider,'WAGO');
assert.throws(()=>db.exec("INSERT INTO user_second_verifications(user_id,provider,provider_user_id) VALUES(1,'PLAYDK','dk-a')"),/UNIQUE/);
db.exec("INSERT INTO user_second_verifications(user_id,provider,provider_user_id,provider_name) VALUES(2,'PLAYDK','dk-b','DK B')");
assert.throws(()=>db.exec("UPDATE wago_verifications SET status='VERIFIED',verified_at=CURRENT_TIMESTAMP WHERE user_id=2"),/SECONDARY_VERIFICATION_PROVIDER_CONFLICT/);
assert.equal(db.prepare('SELECT provider FROM user_second_verifications WHERE user_id=2').get().provider,'PLAYDK');
db.exec("INSERT INTO user_second_verifications(user_id,provider,provider_user_id,provider_name) VALUES(3,'PLAYDK','dk-c','DK C')");
assert.throws(()=>db.exec("INSERT INTO wago_verifications(user_id,wago_nickname,wago_member_no,status) VALUES(3,'wago-c','303','VERIFIED')"),/SECONDARY_VERIFICATION_PROVIDER_CONFLICT/);
db.exec("UPDATE wago_verifications SET status='PENDING' WHERE user_id=1");
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_second_verifications WHERE user_id=1').get().count,0);

const originalFetch=globalThis.fetch;
let capturedAuthorization='';
globalThis.fetch=async(_url,options)=>{
  capturedAuthorization=String(options.headers.Authorization||'');
  return new Response(JSON.stringify({uuid:'playdk-user-1',name:'DK 사용자'}),{status:200,headers:{'content-type':'application/json'}});
};
try{
  const client=createPlaydkIdentityClient({baseUrl:'https://www.playdk.kr',accessKey:'test-access',secretKey:'test-secret',game:'skm'});
  assert.equal(client.gameStartUrl(),'https://www.playdk.kr/api/v2/g/skm');
  assert.deepEqual(await client.getUserInfo('one-time-token'),{uuid:'playdk-user-1',name:'DK 사용자'});
  assert.match(capturedAuthorization,/^HMAC-SHA256 accessKey=test-access, signature=[A-Za-z0-9+/]+=*, timestamp=\d+$/);
  assert.doesNotMatch(capturedAuthorization,/test-secret/);
}finally{globalThis.fetch=originalFetch}

console.log('PLAY DK secondary verification v1780 checks passed');
