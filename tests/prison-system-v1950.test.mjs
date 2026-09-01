import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';

const [server,client,menu,cms,css,index,packageRaw]=await Promise.all([
  readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),
  readFile(new URL('../js/app.js',import.meta.url),'utf8'),
  readFile(new URL('../js/soopketmon-v21-exact-shell-adapter.js',import.meta.url),'utf8'),
  readFile(new URL('../admin/admin-v1276.js',import.meta.url),'utf8'),
  readFile(new URL('../css/prison-v1950.css',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);
const packageJson=JSON.parse(packageRaw);

test('감옥 foundation과 10분~6시간 서버 검증을 고정한다',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS user_prison_status/);
  assert.match(server,/CREATE TABLE IF NOT EXISTS prison_chat_messages/);
  assert.match(server,/durationMinutes<10\|\|durationMinutes>360/);
  assert.match(server,/jailed_until>CURRENT_TIMESTAMP/);
  assert.match(server,/release_reason=CASE WHEN release_reason='' THEN '형기 만료'/);
  assert.match(server,/command_type,payload_json,created_by,expires_at\)\s*VALUES\(\?,'PRISON_LOCK'/);
  assert.match(server,/VALUES\(\?,'PRISON_RELEASE'/);
});

test('수감자는 모든 하위 콘텐츠 라우터보다 먼저 423으로 차단된다',()=>{
  const gate=server.indexOf("code:'USER_INCARCERATED'");
  const firstSubsystem=server.indexOf('const evolutionResponse=await handleEvolution');
  assert.ok(gate>0&&firstSubsystem>gate,'수감 게이트가 하위 콘텐츠 라우터보다 먼저 실행되어야 한다');
  assert.match(server,/const prisonExempt=.*path\.startsWith\('admin\/'\)/s);
  for(const route of ["path==='auth/logout'","path==='me/summary'","path==='user/runtime-command'","path==='prison/status'","path==='prison/chat'"])assert.match(server,new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(server,/return json\(\{error:'수감 중에는 감옥을 벗어날 수 없습니다\.',code:'USER_INCARCERATED',prison\},423\)/);
});

test('감옥 공개 채팅은 인증·길이·속도 제한과 역할 표식을 가진다',()=>{
  assert.match(server,/path==='prison\/chat'/);
  assert.match(server,/Array\.from\(body\)\.length>200/);
  assert.match(server,/created_at>datetime\('now','-2 seconds'\)/);
  assert.match(server,/sender_was_incarcerated/);
  assert.match(client,/PUBLIC CELL CHAT/);
  assert.match(client,/수감자·방문객 공용/);
  assert.match(client,/escapeHtml\(message\.body/);
});

test('전체 메뉴 맨 아래에 행정부·감옥이 연결된다',()=>{
  assert.match(menu,/administration: Object\.freeze\(\{ title: '행정부', routes: Object\.freeze\(\['prison'\]\) \}\)/);
  assert.match(menu,/MENU_GROUP_ORDER = Object\.freeze\(\[[^\]]*'market', 'administration'\]\)/);
  assert.match(menu,/prison: Object\.freeze\(\{ title: '감옥', group: 'administration', icon: 'prison' \}\)/);
  assert.match(client,/prison: prisonView/);
});

test('잠금 화면은 계정명·죄수 캐릭터·창살·남은 형기와 전용 배경을 렌더링한다',async()=>{
  assert.match(client,/id="prisonSceneName"/);
  assert.match(client,/prisoner-cartoon-servile-v1\.png/);
  assert.match(client,/function prisonBarsMarkup/);
  assert.match(client,/id="prisonCountdown"/);
  assert.match(client,/function renderLockedPrison/);
  assert.match(css,/prison-cell-background-v1\.png/);
  assert.match(css,/\.prison-bars i/);
  assert.match(index,/css\/prison-v1950\.css\?v=1950-administration-prison/);
  const [background,character]=await Promise.all([
    stat(new URL('../assets/ui/prison/prison-cell-background-v1.png',import.meta.url)),
    stat(new URL('../assets/ui/prison/prisoner-cartoon-servile-v1.png',import.meta.url))
  ]);
  assert.ok(background.size>100_000);
  assert.ok(character.size>100_000);
});

test('CMS는 현재 수감 상태와 10분~6시간 입력, 즉시 석방을 제공한다',()=>{
  assert.match(cms,/id="prisonDuration"/);
  assert.match(cms,/id="prisonDuration" type="number" min="10" max="360" step="1" value="60"/);
  assert.match(cms,/prisonUserAction\('PRISON'\)/);
  assert.match(cms,/prisonUserAction\('PRISON_RELEASE'\)/);
  assert.match(cms,/PVE·PVP·영토전 등 모든 콘텐츠/);
  assert.match(cms,/prison_jailed_until/);
});

test('감옥 회귀 검사가 운영 출시 게이트에 포함된다',()=>{
  assert.match(packageJson.scripts['test:prison']||'',/prison-system-v1950\.test\.mjs/);
  assert.match(packageJson.scripts['release:gate']||'',/npm run test:prison/);
});
