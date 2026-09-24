// Local-only CMS verification harness. All actions use an ephemeral SQLite database.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { deathGameFixture, seedDeathGameCaptives } from '../tests/helpers/prison-death-game-fixture.mjs';
import { handlePrisonCampAdmin } from '../functions/_prison_camp_admin.js';
import { handlePrisonDeathGame, deathGameAssignmentForUser } from '../functions/_prison_death_game.js';
import { handleClanPrisonCamp, clanCampStatusForUser } from '../functions/_clan_prison_camp.js';

const f = await deathGameFixture(false), owner = { id: 999, role: 'OWNER' };
await f.p("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'").run();
await f.p('CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)').run();
const root = new URL('../', import.meta.url);
const core = await readFile(new URL('admin/admin-v1276.js', root), 'utf8');
const openUser = core.split('\n').find(line => line.startsWith('function openUser(id)'));
if (!openUser) throw new Error('CMS user dialog changed; update harness.');
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>포로수용소 CMS · 로컬 검수</title><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/prison-camp-admin-20260924.css">
<style>body{padding:20px}dialog{max-height:88vh;overflow:auto}#userDialog{width:min(880px,calc(100vw - 24px))}header{margin-bottom:20px}label.field{display:grid;gap:8px}.qaToolbar{display:flex;gap:12px;flex-wrap:wrap}</style>
<header><h1>CMS 유저 관리</h1><p>로컬 검수 전용 · 운영 DB 연결 없음 · 실제 계정 변경 없음</p></header>
<div class="qaToolbar"><button type="button" onclick="openUser(101)">검수 유저 관리</button><button type="button" onclick="openUser(102)">다른 검수 유저 관리</button><a href="/mobile">모바일 390px</a></div>
<dialog id="userDialog"><form method="dialog"><h2 id="userDialogTitle"></h2><input type="hidden" id="selectedUserId"><div id="userDetail"></div>
<div class="actionBlock" id="prisonAdminBlock"><h3>행정부 감옥</h3><p class="muted">기존 감옥 메뉴 · 포로수용소와 별도</p></div><div class="actionBlock"><h3>계정 관리</h3></div><button>닫기</button></form></dialog>
<script>const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])),fmt=s=>s||'-';
const state={role:'OWNER',admin:{id:999},users:[{id:101,nickname:'참가자 하나',role:'USER',status:'ACTIVE',coin:123456},{id:102,nickname:'참가자 둘',role:'USER',status:'ACTIVE',coin:123456}]};
async function api(path,options={}){const response=await fetch('/api/'+path,options);const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
function loadBlackMiracleInventoryAudit(){document.getElementById('blackMiracleInventoryAudit').textContent='검수용 계정 · 재화 변경 없음';}
${openUser}
</script><script src="/admin/prison-camp-admin-20260924.js"></script></html>`;
const allowed = new Set(['/admin/admin-v945.css', '/admin/prison-camp-admin-20260924.css', '/admin/prison-camp-admin-20260924.js']);
for (const path of ['css/clan-prison-camp-v2083.css','css/prison-death-game-20260924.css','js/clan-prison-camp-v2083.js','js/prison-death-game-20260924.js',
  'assets/fonts/clan-camp/BlackHanSans-Regular.ttf','assets/fonts/clan-camp/IBMPlexMono-Medium.ttf','assets/ui/prison/clan-camp-block-v2083.png',
  'assets/ui/prison/death-game-overseer-atlas-20260924.png','assets/ui/prison/death-game-diners-table-atlas-20260924.png']) allowed.add('/'+path);
const campHtml = userId => `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>수용소 강제 참가 로컬 검수</title>
<link rel="stylesheet" href="/css/clan-prison-camp-v2083.css"><link rel="stylesheet" href="/css/prison-death-game-20260924.css"><style>body{margin:0;background:#111a17;color:white}</style><main id="app"></main>
<script>const user={id:${userId},role:'${userId===999?'OWNER':'USER'}'};
async function apiRequest(path,options={}){const r=await fetch('/api/'+path+(path.includes('?')?'&':'?')+'actor='+user.id,options);const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
function applyPrisonStatus(){} function renderShell(){location.reload()} function renderLockedPrison(){location.reload()} function prisonLogout(){}
window.PrisonV1={apply(){},renderLocked(){window.ClanPrisonCamp.stop();document.getElementById('app').innerHTML=window.PrisonDeathGame.lockView();}};
</script><script src="/js/prison-death-game-20260924.js"></script><script src="/js/clan-prison-camp-v2083.js"></script>
<script>document.getElementById('app').innerHTML=window.ClanPrisonCamp.view(user,user.id!==999);window.ClanPrisonCamp.bind(user,user.id!==999);</script></html>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname.startsWith('/api/')) {
      let body = ''; for await (const chunk of req) body += chunk;
      const request = new Request(url, { method: req.method, ...(body ? { body } : {}) });
      const id = Number(url.searchParams.get('actor') || 999), actor = id === 999 ? owner : {id,role:'USER'};
      const params = { path: url.pathname.slice(5), request, env: f.env,
        deps: { authenticate:async()=>actor,requirePermission: async () => actor, prisonStatusForUser:clanCampStatusForUser, deathGameAssignmentForUser,
          readBody: r => r.json(), json: (data, status = 200) => Response.json(data, { status }) } };
      const response = await handlePrisonCampAdmin(params) || await handlePrisonDeathGame(params) || await handleClanPrisonCamp(params);
      res.writeHead(response?.status || 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(response ? await response.text() : '{}'); return;
    }
    if (allowed.has(url.pathname)) {
      res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.png') ? 'image/png' : url.pathname.endsWith('.ttf') ? 'font/ttf' : 'text/javascript' });
      res.end(await readFile(new URL(url.pathname.slice(1), root))); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    if (url.pathname === '/camp') { await seedDeathGameCaptives(f); res.end(campHtml(Number(url.searchParams.get('userId')) === 999 ? 999 : 101)); return; }
    res.end(url.pathname === '/mobile' ? '<!doctype html><html><title>모바일 CMS 검수 · 390px</title><body style="background:#080e18;margin:0"><iframe title="390px 모바일 CMS" src="/" style="display:block;width:390px;height:960px;border:0;margin:0 auto"></iframe></body></html>' : html);
  } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
});
server.listen(8796, '127.0.0.1', () => console.log('Local-only CMS fixture: http://127.0.0.1:8796 /mobile'));
process.on('SIGINT', () => { server.close(); void f.close(); });
