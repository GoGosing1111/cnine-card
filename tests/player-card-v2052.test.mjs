import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../functions/_postgres_d1_compat.js';
import { handlePlayerCard, TROPHY_CATALOG } from '../functions/_player_card.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';

async function fixture() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE FUNCTION sqlite_datetime(text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT CASE WHEN $1='now' THEN sqlite_now() ELSE to_char(timezone('UTC',$1::timestamptz),'YYYY-MM-DD HH24:MI:SS') END$$;
    CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,banned_until text,coin bigint,password_hash text);
    INSERT INTO users VALUES(1,'OWNER','ACTIVE','OWNER',NULL,999,'secret'),(2,'기록유저','ACTIVE','USER',NULL,555,'secret'),(3,'다른유저','ACTIVE','USER',NULL,666,'secret'),(4,'정지유저','ACTIVE','USER','2099-01-01',777,'secret');
    CREATE TABLE pvp_profiles(user_id bigint,season_score int,wins int,losses int);
    INSERT INTO pvp_profiles VALUES(1,99999,999,0),(2,100,10,3),(3,100,9,2),(4,99998,998,0);
    CREATE TABLE pvp_season_settlements(id bigint PRIMARY KEY,season_key text,season_name text,status text,started_at text,completed_at text);
    CREATE TABLE pvp_season_settlement_ranks(settlement_id bigint,user_id bigint,final_rank int,tier_id text,tier_name text,season_score int,wins int,losses int);
    INSERT INTO pvp_season_settlements VALUES(1,'s1','시즌 1','COMPLETED','2026-07-01','2026-07-05'),(2,'s2','시즌 2','COMPLETED','2026-07-06','2026-07-10'),(3,'s3','시즌 3','COMPLETED','2026-07-11','2026-07-15');
    INSERT INTO pvp_season_settlement_ranks VALUES(1,2,3,'challenger','챌린저',3000,10,2),(2,2,1,'challenger','챌린저',3200,11,1),(3,2,10,'challenger','챌린저',2900,8,4);
    CREATE TABLE clan_seasons(id bigint,season_no int,phase text);
    INSERT INTO clan_seasons VALUES(1,1,'COMPLETE'),(2,2,'COMPLETE'),(3,3,'COMPLETE'),(4,4,'ACTIVE');
    CREATE TABLE clan_organizations(id bigint,name text,mark_key text,is_active int);
    INSERT INTO clan_organizations VALUES(8,'이전클랜','SHIELD',1),(9,'현재클랜','SHIELD',1);
    CREATE TABLE clan_members(season_id bigint,clan_id bigint,user_id bigint,member_role text,joined_at text);
    INSERT INTO clan_members VALUES(1,8,2,'MEMBER','2026-07-01'),(2,8,2,'MEMBER','2026-07-01'),(3,8,2,'MEMBER','2026-07-01'),(4,9,2,'MEMBER','2026-09-01'),(4,8,3,'MEMBER','2026-09-01');
    CREATE TABLE clan_season_settlements(season_id bigint,champion_clan_id bigint,status text,reward_status text,completed_at text);
    INSERT INTO clan_season_settlements VALUES(1,8,'COMPLETED','PAID','2026-08-01'),(2,8,'COMPLETED','DISABLED_TEST','2026-08-02'),(3,8,'PROCESSING','PAID',NULL);
    CREATE TABLE avatar_user_loadout_v1(user_id bigint,avatar_code text);
    CREATE TABLE avatar_user_ownership_v1(user_id bigint,avatar_code text,expires_at text);
    CREATE TABLE avatar_catalog_v1(code text,name text,lobby_image text,is_active int,is_public int);
    INSERT INTO avatar_user_loadout_v1 VALUES(2,'A'); INSERT INTO avatar_user_ownership_v1 VALUES(2,'A',NULL);
    INSERT INTO avatar_catalog_v1 VALUES('A','아바타','/assets/test.png',1,1);
    CREATE TABLE user_title_loadout(user_id bigint,title_id bigint);
    CREATE TABLE user_character_titles(user_id bigint,title_id bigint,expires_at text);
    CREATE TABLE character_titles(id bigint,name text,badge_text text,style_preset text,is_active int,is_public int);
    INSERT INTO user_title_loadout VALUES(2,1);INSERT INTO user_character_titles VALUES(2,1,NULL);INSERT INTO character_titles VALUES(1,'칭호','챌린저★★★★','challenger',1,1);
  `);
  const sql = [];
  const db = new __postgresCompatTest.PostgresD1Database({ async query(input) {
    const text = typeof input === 'string' ? input : input.text;
    sql.push(text); const r = await pg.query(text, typeof input === 'string' ? [] : input.values || []);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  } });
  const settings = { seasonName: '시즌 4', startsAt: '2026-07-16T00:00:00Z', endsAt: '2099-01-01T00:00:00Z' };
  const call = (query = 'userId=2', options = {}) => handlePlayerCard({ path: options.path || 'player-card', request: new Request('https://game.test/api/player-card?' + query, { method: options.method || 'GET' }), env: { DB: db }, now: Date.parse('2026-09-06T11:00:00Z'), deps: {
    authenticate: async () => options.anonymous ? null : { id: 1 }, json: (body, status = 200) => ({ body, status }), pvpSettings: async () => settings, pvpSeasonKey: () => 's4',
    resolvePvpTier: (score, _, rank) => rank >= 1 && rank <= 10 ? { id: 'challenger', name: '챌린저', color: '#79c8ef' } : { id: 'bronze', name: '브론즈' }
  } });
  return { pg, sql, call, settings, close: () => pg.close() };
}
const trophy = (r, code) => r.body.trophies.find(t => t.code === code);

test('official records: historical clan affiliation, all three trophies, public-only read with no side effects', async () => {
  const f = await fixture(); try {
    const r = await f.call(); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.player.clan.name, '현재클랜'); assert.equal(r.body.clanHistory[0].clan, '이전클랜');
    assert.equal(trophy(r, 'CLAN_CHAMPION').count, 1); assert.equal(trophy(r, 'CHALLENGER_STREAK_3').owned, true); assert.equal(trophy(r, 'RANKED_CHAMPION').count, 1);
    assert.equal(r.body.ranked.rank, 1); assert.equal(r.body.ranked.tier.id, 'challenger'); assert.equal(r.body.ranked.longestStreak, 3);
    assert.equal(r.body.ranked.bestRank, 1); assert.equal(r.body.player.avatar.name, '아바타');
    assert.equal(r.body.effects.enabled, false); assert.deepEqual(r.body.effects.modifiers, []); assert.equal(r.body.frame.enhancement.enabled, false);
    assert.ok(f.sql.every(s => /^\s*(SELECT|WITH)\b/i.test(s)), f.sql.join('\n'));
    assert.doesNotMatch(JSON.stringify(r.body), /password_hash|secret|"coin"|card_ids|"role":"OWNER"/);
    const other = await f.call('userId=3'); assert.equal(trophy(other, 'CLAN_CHAMPION').owned, false, 'joining an old champion now never grants that past trophy');
    await f.pg.exec("UPDATE clan_members SET joined_at='2026-08-01 20:00:00' WHERE season_id=1 AND user_id=2;UPDATE clan_season_settlements SET completed_at='2026-08-01T10:00:00Z' WHERE season_id=1");
    assert.equal(trophy(await f.call(),'CLAN_CHAMPION').owned,false,'mixed timestamp formats cannot count a member admitted after settlement');
  } finally { await f.close(); }
});
test('missing participation, non-challenger final tier and rank 11 all break consecutive official seasons', async () => {
  const f = await fixture(); try {
    await f.pg.exec('DELETE FROM pvp_season_settlement_ranks WHERE settlement_id=2');
    let r = await f.call(); assert.equal(trophy(r, 'CHALLENGER_STREAK_3').owned, false); assert.equal(r.body.ranked.longestStreak, 1);
    await f.pg.exec("INSERT INTO pvp_season_settlement_ranks VALUES(2,2,1,'grandmaster','그랜드마스터',3200,11,1)");
    assert.equal(trophy(await f.call(), 'CHALLENGER_STREAK_3').owned, false);
    await f.pg.exec("UPDATE pvp_season_settlement_ranks SET tier_id='challenger',final_rank=11 WHERE settlement_id=2");
    assert.equal(trophy(await f.call(), 'CHALLENGER_STREAK_3').owned, false);
    await f.pg.exec("UPDATE pvp_season_settlement_ranks SET final_rank=1 WHERE settlement_id=2;INSERT INTO pvp_season_settlements VALUES(4,'old4','시즌 4','COMPLETED','2026-07-16','2026-07-20')");
    r = await f.call(); assert.equal(trophy(r, 'CHALLENGER_STREAK_3').owned, true); assert.equal(r.body.ranked.currentStreak, 0); assert.equal(r.body.ranked.longestStreak, 3);
    assert.equal(trophy(r, 'CHALLENGER_STREAK_3').acquiredAt, '2026-07-15');
  } finally { await f.close(); }
});
test('unfinished settlements and expired season never claim current challenger; hidden/expired appearance stays private', async () => {
  const f = await fixture(); try {
    await f.pg.exec("UPDATE pvp_season_settlements SET status='MESSAGES_READY',completed_at=NULL WHERE id=3;UPDATE avatar_catalog_v1 SET is_public=0;UPDATE user_character_titles SET expires_at='2000-01-01'");
    let r = await f.call(); assert.equal(trophy(r, 'CHALLENGER_STREAK_3').owned, false); assert.equal(r.body.player.avatar, null); assert.equal(r.body.player.title, null);
    f.settings.endsAt = '2026-08-01T00:00:00Z'; r = await f.call(); assert.equal(r.body.ranked.state, 'SETTLING'); assert.equal(r.body.ranked.tier, null);
    f.settings.endsAt = '2099-01-01T00:00:00Z'; await f.pg.exec("INSERT INTO pvp_season_settlements VALUES(4,'s4','시즌 4','PREPARING','2026-07-16',NULL)");
    assert.equal((await f.call()).body.ranked.state, 'SETTLING');
  } finally { await f.close(); }
});
test('GET/auth/identity validation and inactive target guards fail closed', async () => {
  const f = await fixture(); try {
    assert.equal((await f.call('', { method: 'POST' })).status, 405);
    assert.equal((await f.call('userId=2', { anonymous: true })).status, 401);
    for (const q of ['', 'userId=-1', 'userId=NaN', 'userId=1%20OR%201=1', 'userId=9007199254740999']) assert.equal((await f.call(q)).status, 400);
    assert.equal((await f.call('userId=4')).status, 404);
    assert.equal((await f.call('nickname=' + encodeURIComponent('기록유저'))).body.player.id, 2);
    assert.equal((await f.call('nickname=' + encodeURIComponent("' OR 1=1 --"))).status, 404);
    assert.equal(await f.call('', { path: 'other' }), null);
  } finally { await f.close(); }
});
test('history is bounded but all-time honors survive outside the displayed 12 seasons', async () => {
  const f = await fixture(); try {
    for (let i=4;i<=18;i++) await f.pg.query("INSERT INTO pvp_season_settlements VALUES($1,$2,$3,'COMPLETED',$4,$4)", [i, 'past'+i, '시즌 '+i, '2026-08-'+String(i).padStart(2,'0')]);
    for (let i=4;i<=18;i++) await f.pg.query("INSERT INTO pvp_season_settlement_ranks VALUES($1,2,20,'master','마스터',2000,5,5)", [i]);
    const r=await f.call(); assert.equal(r.body.ranked.history.length,12); assert.equal(r.body.ranked.completedSeasons,18); assert.equal(r.body.ranked.bestRank,1); assert.equal(trophy(r,'CHALLENGER_STREAK_3').owned,true); assert.equal(r.body.ranked.currentStreak,0);
  } finally { await f.close(); }
});
test('unavailable source records return a retryable error, not invented zero awards', async () => {
  const f = await fixture(); try { await f.pg.exec('DROP TABLE clan_season_settlements'); assert.equal((await f.call()).status,503); } finally { await f.close(); }
});
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('nickname renderer escapes text and attributes; only local asset images allowed', () => {
  const window = { location:{origin:'https://game.test'} }; vm.runInNewContext(read('js/player-card-v2052.js'),{window,URL,Intl,AbortController});
  const ui=window.PlayerCallingCard,html=ui.nameHtml('<img onerror="bad">',0);
  assert.doesNotMatch(html,/<img/); assert.match(html,/&lt;img/); assert.match(ui.nameHtml('닉',42),/data-player-id="42"/);
  assert.equal(ui.asset('javascript:alert(1)'), ''); assert.equal(ui.asset('https://evil.test/track'), ''); assert.equal(ui.asset('/api/private'), ''); assert.equal(ui.asset('/assets/safe.webp'),'/assets/safe.webp');
});
test('live connections use exact user IDs; FX remains lazy, cancellable and non-blocking', () => {
  const ui=read('js/player-card-v2052.js'),fx=read('js/player-card-fx-v2052.src.js'),app=read('js/app.js'),index=read('index.html');
  assert.match(ui,/modal\.showModal/); assert.match(ui,/run !== serial/); assert.match(ui,/controller\?\.abort/); assert.match(ui,/timeoutMs: 12000/); assert.match(ui,/addEventListener\('close'/); assert.match(ui,/if \(!modal.open\) cleanup/);
  assert.match(fx,/prefers-reduced-motion/); assert.match(fx,/visibilitychange/); assert.match(fx,/observer\?\.disconnect/); assert.match(fx,/app\.destroy/); assert.match(fx,/gsap/);
  assert.match(app,/playerIdentityHtml\(r.nickname,r.user_id\|\|r.id\)/); assert.match(read('js/clan-v1.js'),/nameHtml\(m.nickname,m.userId\)/); assert.match(read('js/territory-war-v1811.js'),/nameHtml\(row.nickname,row.user_id\)/);
  assert.match(index,/player-card-v2052.js/); assert.doesNotMatch(index,/<script[^>]+player-card-fx/); assert.match(app,/playerCardFx:\{/);
  assert.match(read('functions/api/[[path]].js'),/handlePlayerCard\(\{path,request,env,deps:\{authenticate,json,pvpSettings,resolvePvpTier,pvpSeasonKey\}\}\)/);
});
test('all trophy assets are real transparent production assets with preserved high-resolution originals', async () => {
  for(const t of TROPHY_CATALOG) {
    const path=new URL('..'+t.art,import.meta.url),meta=await sharp(path.pathname.replace(/^\/(?=[A-Z]:)/,'' )).metadata();
    assert.equal(meta.width,512); assert.equal(meta.height,512); assert.equal(meta.hasAlpha,true);
    const file=new URL('..'+t.art.replace('.webp','.png'),import.meta.url),src=sharp(file.pathname.replace(/^\/(?=[A-Z]:)/,''));
    const original=await src.metadata(); assert.ok(original.width>=1024); const {data}=await src.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let transparent=0,opaque=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)transparent++;if(data[i]>=250)opaque++;}assert.ok(transparent>100000);assert.ok(opaque>100000,'at least 98% opacity through the trophy body');
  }
});

function uiFixture() {
  const events = {}, pending = [], focus = { isConnected: true, calls: 0, focus() { this.calls++; } };
  const closeButton = { focus() {} }, host = { isConnected: true }, card = {};
  const modal = { open: false, innerHTML: '', setAttribute() {}, addEventListener(name, fn) { events[name] = fn; }, showModal() { this.open = true; }, close() { this.open = false; }, querySelector(sel) { return sel === '.pc-fx' ? host : sel === '.pc-card' ? card : closeButton; } };
  const document = { activeElement: focus, body: { style: { overflow: 'auto' }, appendChild() {} }, createElement() { return modal; }, addEventListener() {} };
  const window = { document, location: { origin: 'https://game.test' }, apiRequest(path, options) { return new Promise((resolve, reject) => pending.push({ path, options, resolve, reject })); } };
  vm.runInNewContext(read('js/player-card-v2052.js'), { window, URL, Intl, AbortController });
  const profile = name => ({ player: { nickname: name }, ranked: { history: [] }, trophies: [], frame: { level: 0 } });
  return { window, modal, document, events, pending, focus, profile, ui: window.PlayerCallingCard };
}
test('rapid user switching ignores stale responses and closing restores focus/scroll without late-close races', async () => {
  const f = uiFixture(); const a = f.ui.open({userId:1}), b = f.ui.open({userId:2});
  assert.equal(f.pending[0].options.signal.aborted,true);
  f.pending[1].resolve(f.profile('새 유저')); await b;
  f.pending[0].resolve(f.profile('이전 유저')); await a;
  assert.match(f.modal.innerHTML,/새 유저/); assert.doesNotMatch(f.modal.innerHTML,/이전 유저/);
  f.ui.close(); assert.equal(f.document.body.style.overflow,'auto'); assert.equal(f.focus.calls,1);
  const c=f.ui.open({userId:3}); f.events.close(); assert.equal(f.pending[2].options.signal.aborted,false,'queued close event cannot abort a newly opened card');
  f.ui.close(); assert.equal(f.pending[2].options.signal.aborted,true); f.pending[2].resolve(f.profile('닫힌 유저')); await c; assert.doesNotMatch(f.modal.innerHTML,/닫힌 유저/);
});
test('WebGL startup failure does not hide the card and a late renderer is destroyed after close', async () => {
  const f=uiFixture(); let resolveFx, destroyed=0;
  f.window.PlayerCardFX={mount:()=>new Promise(resolve=>{resolveFx=resolve;})};
  await f.ui.open({previewData:f.profile('보이는 명함')}); await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.modal.innerHTML,/보이는 명함/); assert.equal(f.modal.open,true);
  f.ui.close(); resolveFx({destroy(){destroyed++;}}); await new Promise(resolve=>setImmediate(resolve)); assert.equal(destroyed,1);
  f.window.PlayerCardFX={mount:async()=>{throw Error('WebGL unavailable');}};
  await f.ui.open({previewData:f.profile('WebGL 없이 표시')}); await new Promise(resolve=>setImmediate(resolve)); assert.match(f.modal.innerHTML,/WebGL 없이 표시/); f.ui.close();
});
test('request error has retry and close controls, not an infinite loader', async () => {
  const f=uiFixture(),p=f.ui.open({userId:2}); f.pending[0].reject(Error('연결 실패')); await p;
  assert.match(f.modal.innerHTML,/data-pc-retry/); assert.match(f.modal.innerHTML,/data-pc-close/); assert.match(f.modal.innerHTML,/연결 실패/); f.ui.close();
});

test('empty trophy shelves keep border FX without creating an empty GSAP tween', async () => {
  for (const owned of [false, true]) {
    let tweens=0, destroyed=0;
    const button={addEventListener(){},removeEventListener(){}};
    const target={style:{},closest(){return button;}};
    class Application {
      screen={width:600,height:800}; ticker={add(){}}; stage={addChild(){}}; renderer={resize(){}}; canvas={};
      async init(){} start(){} stop(){} destroy(){destroyed++;}
    }
    class Graphics { clear(){return this;} circle(){return this;} fill(){return this;} }
    const context={Application,Graphics,devicePixelRatio:1,ResizeObserver:class{observe(){}disconnect(){}},
      matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
      document:{hidden:false,addEventListener(){},removeEventListener(){}},
      gsap:{killTweensOf(){},to(){},fromTo(targets){assert.ok(targets.length);tweens++;return {kill(){},pause(){},resume(){}};}}
    };
    vm.runInNewContext(read('js/player-card-fx-v2052.src.js').replace(/^import .*;\r?\n/gm,''),context);
    const controller=new AbortController();
    const renderer=await context.PlayerCardFX.mount({isConnected:true,clientWidth:600,clientHeight:800,appendChild(){}},{querySelectorAll:()=>owned?[target]:[]},controller.signal);
    assert.ok(renderer,'border renderer must mount for both new and decorated players');
    assert.equal(tweens,owned?1:0);
    controller.abort(); assert.equal(destroyed,1); renderer.destroy(); assert.equal(destroyed,1);
  }
});
