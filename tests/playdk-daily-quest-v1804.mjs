import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPlaydkIdentityClient} from '../functions/_playdk_client.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [api,app,bgm,index,worker,admin,adminIndex]=await Promise.all([
  read('functions/api/[[path]].js'),read('js/app.js'),read('js/lobby-bgm-v1803.js'),read('index.html'),
  read('service-worker.js'),read('admin/admin-v1276.js'),read('admin/index.html')
]);

const originalFetch=globalThis.fetch;
let capturedUrl='',capturedOptions=null;
globalThis.fetch=async(url,options)=>{
  capturedUrl=String(url);capturedOptions=options;
  return new Response(JSON.stringify({
    userUuid:'dk-user',questDate:'2026-08-23',timezone:'Asia/Seoul',boardSlugs:['skm'],
    count:300,countsByBoardSlug:{skm:300},
    posts:[{postId:1,boardSlug:'skm',createdAt:'2026-08-23T01:00:00+09:00'}],postsTruncated:true
  }),{status:200,headers:{'content-type':'application/json'}});
};
try{
  const client=createPlaydkIdentityClient({baseUrl:'https://www.playdk.kr',accessKey:'access',secretKey:'secret'});
  const result=await client.getDailyPostCount({userUuid:'dk-user',questDate:'2026-08-23',boardSlugs:['SKM','skm']});
  assert.equal(capturedUrl,'https://www.playdk.kr/api/v2/ext/board/daily-post-count');
  assert.equal(capturedOptions.method,'POST');
  assert.match(String(capturedOptions.headers.Authorization),/^HMAC-SHA256 accessKey=access, signature=/);
  assert.deepEqual(JSON.parse(capturedOptions.body),{userUuid:'dk-user',questDate:'2026-08-23',boardSlugs:['skm']});
  assert.equal(result.count,300,'퀘스트 판정은 잘릴 수 있는 posts.length가 아니라 count를 써야 한다');
  assert.equal(result.posts.length,1);
  assert.equal(result.postsTruncated,true);
}finally{globalThis.fetch=originalFetch}

const routes=api.slice(api.indexOf("path==='playdk-daily-quest/status'"),api.indexOf("if(path==='messages'"));
assert.match(api,/getDailyPostCount\(\{userUuid,questDate,boardSlugs:settings\.boardSlugs\}\)/);
assert.match(routes,/user_second_verifications WHERE user_id=\? AND provider='PLAYDK'/);
assert.match(routes,/stablePostCount=Number\(inspected\.postCount\|\|0\)/);
assert.doesNotMatch(routes,/inspectWagoDailyPosts\(/);
assert.match(routes,/PLAYDK_DAILY_QUEST/);
assert.match(app,/playdk-daily-quest\/status/);
assert.match(app,/PLAY DK 게시판 일일퀘스트/);
assert.match(app,/result\?\.newlyVerified===false\|\|result\?\.duplicate===true/);
assert.match(api,/status:'ALREADY_VERIFIED',newlyVerified:false/);
assert.match(bgm,/audio\.muted = isMuted\(\)/);
assert.match(bgm,/el\.muted = next/);
assert.match(index,/app\.js\?v=1804-playdk-daily-bgm-mute/);
assert.match(worker,/soop-card-shell-v1804-playdk-daily-bgm-mute/);
assert.match(admin,/u\.playdk_name/);
assert.match(adminIndex,/PLAY DK DAILY QUEST/);

console.log('PLAY DK daily quest, callback and BGM mute v1804 checks passed');
