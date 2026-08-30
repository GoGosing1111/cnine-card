import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [appSource, rendererSource, raidCss, pveCommandSource] = await Promise.all([
  readFile(new URL('js/app.js', root), 'utf8'),
  readFile(new URL('js/battle-v3-live.js', root), 'utf8'),
  readFile(new URL('css/raid-v3-async-v1779.css', root), 'utf8'),
  readFile(new URL('js/pve-command-v2-live.js', root), 'utf8'),
]);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

const recoverySource = sourceBetween(appSource, 'function renderRaidV3Recovery(', '\nasync function startRaidV3Battle');
const startSource = sourceBetween(appSource, 'async function startRaidV3Battle(){', '\nfunction handleRaidV3StartClick');

test('mobile renderer failure opens a framed original-card recovery view and returns to raid status', () => {
  const listeners = new Map();
  let reloads = 0;
  let destroys = 0;
  const modal = {
    __battleV2Renderer: { destroy() { destroys += 1; } },
    className: 'modal show battle-v3-modal',
    attributes: new Map(),
    innerHTML: '',
    onclick: null,
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
    querySelector(selector) {
      return { addEventListener(type, callback) { listeners.set(`${selector}:${type}`, callback); } };
    },
  };
  const context = {
    console,
    modal,
    raidState: { v3InFlight: true },
    escapeHtml: value => String(value ?? '').replaceAll('<', '&lt;'),
    loadUser: () => ({ nickname: '모바일유저' }),
    loadRaidView: () => { reloads += 1; },
    raidCombatCard: card => `<article class="card-frame grade-${card.grade}" data-original="${card.image}"></article>`,
  };
  vm.createContext(context);
  vm.runInContext(`${recoverySource}\nthis.recovered=renderRaidV3Recovery(modal,{bossName:'BOSS',bossImage:'/boss.png',currentHp:50,maxHp:100},{nickname:'테스터',shownDamage:77,cards:[{grade:'ZENITH',image:'/card-original.png',battleSprite:'/sd.png'}]},new Error('WebGL context lost'),null);`, context);

  assert.equal(context.recovered, true);
  assert.match(modal.innerHTML, /레이드 연결 유지/);
  assert.match(modal.innerHTML, /SERVER SYNC/);
  assert.match(modal.innerHTML, /grade-ZENITH/);
  assert.match(modal.innerHTML, /\/card-original\.png/);
  assert.doesNotMatch(modal.innerHTML, /\/sd\.png|battleSprite|battle_sprite/);
  assert.equal(context.raidState.v3InFlight, true, 'recovery modal must prevent duplicate V3 starts');

  listeners.get('#raidV3SafeReturn:click')();
  assert.equal(destroys, 1);
  assert.equal(context.raidState.v3InFlight, false);
  assert.equal(modal.className, 'modal');
  assert.equal(modal.innerHTML, '');
  assert.equal(reloads, 1);
});

test('raid start has a finite deadline, invalidates late work, hard-resets WebGL and never falls back to alert', () => {
  assert.match(startSource, /attemptId=\+\+raidState\.v3Attempt/);
  assert.match(startSource, /raidV3Deadline\(/);
  assert.match(startSource, /ProjectVBattleV3Live\?\.hardReset/);
  assert.match(startSource, /renderRaidV3Recovery\(modal,current,me,error,button\)/);
  assert.doesNotMatch(startSource, /alert\(/);
  assert.match(rendererSource, /withRejectingTimeout\(initialize\(\),\s*14000/);
  assert.match(rendererSource, /ProjectVPixiBattle\?\.destroy\?\.\(\)/);
  assert.match(rendererSource, /__V3_PIXI_GENERATION/);
  assert.match(rendererSource, /hardReset:\s*hardResetPixiBattle/);
});

test('raid entry immediately renders a mobile loader and late deck config cannot steal the active tab', () => {
  assert.match(pveCommandSource, /id="pveRaidView"[^>]*>[\s\S]*?raid-entry-loading[\s\S]*?월드 레이드 전황 연결 중/);
  const applySource = sourceBetween(appSource, 'function applyPveViewMode(', 'const MOBILE_PVE_TAB_KEY');
  assert.match(applySource, /if\(raid&&!raid\.hidden\)return/);
  assert.match(raidCss, /\.raid-v3-safe-card-rail\{[^}]*overflow-x:auto/);
  assert.match(raidCss, /@media\(max-width:640px\)[\s\S]*?\.raid-v3-safe-footer\{[^}]*position:sticky/);
  assert.match(raidCss, /\.raid-v3-safe-return\{[^}]*min-height:46px/);
});
