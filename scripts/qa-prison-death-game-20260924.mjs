// Local-only QA, no production bindings or accounts: node scripts/qa-prison-death-game-20260924.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deathGameFixture } from '../tests/helpers/prison-death-game-fixture.mjs';
import { handlePrisonDeathGame } from '../functions/_prison_death_game.js';
import { handleClanPrisonCamp, clanCampStatusForUser } from '../functions/_clan_prison_camp.js';
const workspace = fileURLToPath(new URL('../', import.meta.url));
const fixture = await deathGameFixture();
const app = await readFile(new URL('../js/app.js',import.meta.url),'utf8');
const applySource=app.slice(app.indexOf('const prisonUiState='),app.indexOf('function isPrisonLocked'));
const renderSource=app.slice(app.indexOf('function renderLockedPrison'),app.indexOf('window.PrisonV1='));
await fixture.p("UPDATE users SET nickname='참가자 셋' WHERE id=103").run();
await fixture.p("INSERT INTO users(id,nickname,role) VALUES(104,'참가자 넷','USER')").run();
const users = Object.fromEntries((await fixture.p('SELECT id,nickname,role FROM users').all()).results.map(user=>[user.id,{...user,serverUserId:user.id}]));
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url,'http://127.0.0.1:8857');
    outgoing.setHeader('Cache-Control','no-store');
    if(url.pathname==='/mobile'){
      outgoing.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      outgoing.end('<!doctype html><meta charset="utf-8"><title>390 × 844 모바일 검수</title><style>body{margin:16px;background:#080c12}iframe{display:block;width:390px;height:844px;border:0;margin:auto}</style><iframe title="390px 모바일 체험" src="/preview/prison-death-game-v2/"></iframe>');return;
    }
    if (url.pathname.startsWith('/api/')) {
      const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
      const user=users[Number(incoming.headers['x-qa-user'])];
      const request=new Request(url,{method:incoming.method,...incoming.method==='POST'?{body:Buffer.concat(chunks).toString()}:{}});
      const deps={authenticate:async()=>user,readBody:r=>r.json(),json:(d,status=200)=>Response.json(d,{status}),prisonStatusForUser:clanCampStatusForUser};
      const path=url.pathname.slice(5);
      let response;
      if(path==='prison/status')response=Response.json({prison:await clanCampStatusForUser(fixture.env,user.id),serverNow:new Date().toISOString()});
      else response=await handlePrisonDeathGame({path,request,env:fixture.env,deps})||await handleClanPrisonCamp({path,request,env:fixture.env,deps});
      if(!response)response=Response.json({error:'QA route unavailable'},{status:404});
      outgoing.writeHead(response.status,{'Content-Type':'application/json'});outgoing.end(await response.text());return;
    }
    if(url.pathname==='/'){
      const user=users[Number(url.searchParams.get('user')||999)]||users[999];
      outgoing.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      outgoing.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>죽음의 눈치게임 · 로컬 검수 ${user.nickname}</title><link rel="stylesheet" href="/css/clan-prison-camp-v2083.css"><link rel="stylesheet" href="/css/prison-death-game-20260924.css"><style>body{margin:0;background:#080c17;padding:12px}body.prison-locked{overflow:hidden}.modal{display:none}</style></head><body><div id="app"></div><script>
      const qaUser=${JSON.stringify(user)}, app=document.getElementById('app'), PRISON_DEFAULT_HIT_COOLDOWN_SECONDS=60;
      let runtimeCommandContext='';
      const loadUser=()=>qaUser, saveUser=()=>{},mergeApiUserSummary=x=>x;
      ${applySource}
      const stopPrisonWatch=()=>window.ClanPrisonCamp?.stop(),stopRuntimeCommandPoll=()=>{};
      const prisonView=()=>'',bindPrisonView=()=>{};
      ${renderSource}
      window.PrisonV1={apply:applyPrisonStatus,renderLocked:renderLockedPrison};
      function renderShell(){app.innerHTML=window.ClanPrisonCamp.view(qaUser);window.ClanPrisonCamp.bind(qaUser)}
      async function prisonLogout(){window.PrisonDeathGame.stop();app.textContent='로컬 검수 로그아웃'}
      async function apiRequest(path,options={}){const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json','x-qa-user':qaUser.id}});const d=await r.json();if(!r.ok){if(d.code==='USER_INCARCERATED')renderLockedPrison(d.prison);throw Error(d.error)}return d}
      </script><script src="/js/clan-prison-camp-v2083.js"></script><script src="/js/prison-death-game-20260924.js"></script><script>apiRequest('prison/status').then(d=>d.prison.incarcerated?renderLockedPrison(d.prison):renderShell());</script></body></html>`);return;
    }
    const path=resolve(workspace,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
    if(!path.startsWith(resolve(workspace)+sep))throw Error('outside workspace');
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2'};
    const file=await readFile(path);outgoing.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});outgoing.end(file);
  }catch(error){if(!outgoing.headersSent)outgoing.writeHead(error.code==='ENOENT'?404:500,{'Content-Type':'text/plain'});outgoing.end(error.message);}
});
server.listen(8857,'127.0.0.1',()=>console.log('Local SQLite QA only: http://127.0.0.1:8857/?user=999 (operator), user=101 / user=102 (players)'));
