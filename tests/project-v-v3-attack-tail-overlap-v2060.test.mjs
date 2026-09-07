// V2060(2부): 타격 연출의 뒷정리(공격자 복귀 + 데미지 숫자 페이드)를 다음 행동과 겹치게 한 변경 검증.
// 임팩트는 0.25초에 끝나는데 타임라인은 0.73초까지 이어졌다. 복귀가 시작되는 0.43초에
// 호출자를 놓아주고 나머지 0.3초는 겹쳐서 재생한다. cleanup 은 타임라인이 실제로 끝날 때만 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gsap } from 'gsap';

const read = path => fs.readFileSync(path, 'utf8');
const engineSrc = read('preview/project-v-v3/source/battle/BattleEngine.js');
const bundleSrc = read('preview/project-v-v3/project-v-pixi-battle.bundle.js');

const PLAYBACK_SPEED = 1.3;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function extractMethod(source, startNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `메서드를 찾지 못했습니다: ${startNeedle}`);
  let i = source.indexOf('(', start);
  let parens = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === '(') parens += 1;
    else if (source[i] === ')') { parens -= 1; if (parens === 0) { i += 1; break; } }
  }
  i = source.indexOf('{', i);
  let depth = 0, inStr = null, prev = '';
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (inStr) { if (ch === inStr && prev !== '\\') inStr = null; }
    else if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
    prev = prev === '\\' && ch === '\\' ? '' : ch;
  }
  throw new Error(`본문 끝을 찾지 못했습니다: ${startNeedle}`);
}

const timelineSrc = extractMethod(engineSrc, '  timeline(build,cleanup=');
const settleSrc = extractMethod(engineSrc, '  settlePendingTails(characters=');

// 최소 gsap 타임라인 목: call(fn,[],at) 예약과 onComplete 만 재현한다.
function makeGsapMock() {
  return {
    timeline({ onComplete, onInterrupt } = {}) {
      const calls = []; let total = 0, scale = 1, killed = false;
      const tl = {
        to(target, vars, at) { total = Math.max(total, (Number(at) || 0) + (Number(vars?.duration) || 0)); return tl; },
        fromTo(target, from, to, at) { total = Math.max(total, (Number(at) || 0) + (Number(to?.duration) || 0)); return tl; },
        set() { return tl; },
        call(fn, args, at) { calls.push({ fn, at: Number(at) || 0 }); total = Math.max(total, Number(at) || 0); return tl; },
        timeScale(v) { if (v === undefined) return scale; scale = v; return tl; },
        play() {
          for (const c of calls) setTimeout(() => { if (!killed) c.fn(); }, (c.at / scale) * 1000);
          setTimeout(() => { if (!killed) onComplete?.(); }, (total / scale) * 1000);
          return tl;
        },
        pause() { return tl }, resume() { return tl },
        kill() { killed = true; onInterrupt = null; return tl }
      };
      return tl;
    }
  };
}

function buildHarness(runtime = makeGsapMock()) {
  const Harness = new Function('gsap', 'PLAYBACK_SPEED', `
    return class Harness {
      constructor(){
        this.simpleTimelines=new Set();
        this.pendingTails=new Map();
        this.reducedMotion=false;
        this.paceScale=1;
      }
      ${timelineSrc.trim()}
      ${settleSrc.trim()}
    };
  `)(runtime, PLAYBACK_SPEED);
  return new Harness();
}

// 0.73초 타임라인, 0.43초에 릴리스 -> 재생속도 1.3 기준 331ms / 561ms
const RELEASE_MS = Math.round((0.43 / PLAYBACK_SPEED) * 1000);
const END_MS = Math.round((0.73 / PLAYBACK_SPEED) * 1000);

test('releaseAt 시점에 호출자를 놓아주되 cleanup 은 타임라인 끝에서만 돈다', async () => {
  const engine = buildHarness();
  const actor = { name: 'actor' }, victim = { name: 'victim' };
  let cleaned = 0;
  const started = Date.now();
  const promise = engine.timeline(
    tl => { tl.to({}, { duration: 0.73 }, 0); },
    () => { cleaned += 1; },
    null,
    { releaseAt: 0.43, owners: [actor, victim] }
  );
  await promise;
  const releasedAt = Date.now() - started;

  assert.ok(releasedAt < END_MS - 60, `릴리스가 ${releasedAt}ms 로 너무 늦습니다 (끝은 ${END_MS}ms)`);
  assert.ok(releasedAt >= RELEASE_MS - 60, `릴리스가 ${releasedAt}ms 로 너무 이릅니다 (기대 ${RELEASE_MS}ms)`);
  assert.equal(cleaned, 0, '릴리스 시점에 cleanup 이 돌면 공격자가 튀고 데미지 라벨이 사라집니다');
  assert.equal(engine.pendingTails.size, 2, '꼬리 재생 중에는 소유자가 등록돼 있어야 합니다');

  await wait(END_MS - releasedAt + 120);
  assert.equal(cleaned, 1, '타임라인이 끝나면 cleanup 이 정확히 한 번 돌아야 합니다');
  assert.equal(engine.pendingTails.size, 0, '끝난 뒤에는 소유자 등록이 해제돼야 합니다');
  assert.equal(engine.simpleTimelines.size, 0);
});

test('settlePendingTails 는 남은 꼬리를 즉시 끝내고 cleanup 을 돌린다', async () => {
  const engine = buildHarness();
  const actor = { name: 'actor' };
  let cleaned = 0;
  const promise = engine.timeline(
    tl => { tl.to({}, { duration: 0.73 }, 0); },
    () => { cleaned += 1; },
    null,
    { releaseAt: 0.43, owners: [actor] }
  );
  await promise;
  assert.equal(cleaned, 0);

  engine.settlePendingTails([actor]);
  assert.equal(cleaned, 1, '꼬리를 강제 종료하면 cleanup 이 바로 돌아야 합니다');
  assert.equal(engine.pendingTails.size, 0);

  // 강제 종료 뒤 원래 완료 시점이 지나도 cleanup 이 두 번 돌면 안 된다.
  await wait(END_MS + 150);
  assert.equal(cleaned, 1, 'cleanup 이 두 번 돌면 안 됩니다');
});

test('releaseAt 을 주지 않으면 기존처럼 끝까지 기다린다', async () => {
  const engine = buildHarness();
  let cleaned = 0;
  const started = Date.now();
  await engine.timeline(tl => { tl.to({}, { duration: 0.73 }, 0); }, () => { cleaned += 1; });
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= END_MS - 60, `기존 경로가 ${elapsed}ms 로 일찍 끝났습니다`);
  assert.equal(cleaned, 1);
  assert.equal(engine.pendingTails.size, 0, 'owners 를 안 주면 pendingTails 를 건드리지 않아야 합니다');
});

test('소스 계약: normalAttack 만 꼬리를 겹치고, 전직·저모션은 제외한다', () => {
  assert.match(engineSrc, /this\.pendingTails=new Map\(\);/);
  assert.match(engineSrc, /this\.bannerQueue\.length=0;\s*\n\s*this\.pendingTails\.clear\(\);/);
  // 새 행동 전에 꼬리를 정리한다
  assert.match(engineSrc, /this\.settlePendingTails\(\[actor,victim\]\);/);
  // 전직 연출(히트스탑 authored)과 저모션은 조기 릴리스 제외
  assert.match(engineSrc, /advancementProfile\|\|this\.reducedMotion\?\{\}:\{releaseAt:returnAt,owners:\[actor,victim\]\}/);
  // 컷인 스킬은 배경 디밍 복원이 뒤에 있어 그대로 끝까지 기다린다
  const skillSrc = engineSrc.slice(engineSrc.indexOf('async playTacticalSkill('), engineSrc.indexOf('async playAdvancementMoment('));
  assert.ok(!/releaseAt/.test(skillSrc), '컷인 스킬은 조기 릴리스 대상이 아닙니다');
});

test('번들이 소스와 같은 계약을 담고 있다', () => {
  assert.ok(bundleSrc.includes('this.pendingTails=new Map'), '번들 생성자에 pendingTails 가 없습니다');
  assert.ok(bundleSrc.includes('this.pendingTails.clear()'), '번들 cancelTimelines 에 pendingTails 비우기가 없습니다');
  assert.ok(bundleSrc.includes('settlePendingTails('), '번들에 settlePendingTails 가 없습니다');
  assert.equal((bundleSrc.match(/settlePendingTails\(/g) || []).length,
    (engineSrc.match(/settlePendingTails\(/g) || []).length, '소스와 번들의 소유자 정리 경로가 같아야 합니다');
  const normal = extractMethod(bundleSrc, 'async normalAttack(');
  const settledOwners = normal.match(/this\.settlePendingTails\(\[([^,\]]+),([^,\]]+)\]\)/);
  const releasedOwners = normal.match(/releaseAt:[$\w]+,owners:\[([^,\]]+),([^,\]]+)\]/);
  assert.ok(settledOwners && releasedOwners, '일반 타격은 releaseAt 과 공격자·피격자 소유권을 함께 설정해야 합니다');
  assert.deepEqual(releasedOwners.slice(1), settledOwners.slice(1), '정리한 캐릭터와 새 꼬리의 소유자가 달라지면 안 됩니다');
  assert.match(bundleSrc, /releaseAt:[$\w]+=null,owners:[$\w]+=null/, '번들 timeline() 에 releaseAt/owners 파라미터가 없습니다');
});

test('실제 GSAP도 임팩트·조기 반환·완료 cleanup 을 분리하고 중단 시 한 번만 정리한다', async () => {
  const engine = buildHarness(gsap);
  const actor = {};
  let impacts = 0, cleaned = 0, resolved = false;
  try {
    const pending = engine.timeline(tl => {
      tl.to({ x: 0 }, { x: 1, duration: .73 }, 0);
      tl.call(() => { impacts += 1; }, [], .25);
    }, () => { cleaned += 1; }, null, { releaseAt: .43, owners: [actor] });
    pending.then(() => { resolved = true; });
    const [{ instance }] = [...engine.simpleTimelines];
    instance.pause().totalTime(.42, false);
    await Promise.resolve();
    assert.equal(impacts, 1);
    assert.equal(resolved, false);
    instance.totalTime(.43, false);
    assert.equal(await pending, true);
    assert.equal(cleaned, 0);
    engine.settlePendingTails([actor, actor]);
    assert.equal(cleaned, 1, 'GSAP onInterrupt 와 settle 이 중복 실행돼도 cleanup 은 한 번이어야 합니다');
    assert.equal(engine.pendingTails.size, 0);
    assert.equal(engine.simpleTimelines.size, 0);

    const finishing = engine.timeline(tl => tl.to({ x: 0 }, { x: 1, duration: .73 }, 0),
      () => { cleaned += 1; }, null, { releaseAt: .43, owners: [actor] });
    const [{ instance: complete }] = [...engine.simpleTimelines];
    complete.pause().totalTime(.73, false);
    assert.equal(await finishing, true);
    assert.equal(cleaned, 2);
    assert.equal(engine.pendingTails.size, 0);
  } finally {
    engine.settlePendingTails([actor]);
    gsap.ticker.sleep();
  }
});

test('일반 타격 직후 컷인 스킬은 이전 공격자·피격자 꼬리를 정리한 뒤 시작한다', async () => {
  const engine = buildHarness(gsap);
  const actor = { name: 'actor', root: { x: 80 } };
  const victim = { root: { x: 90 }, hp: 100 };
  engine.allies = [actor];
  engine.enemies = [victim];
  engine.cards = [{ data: { ability: 'skill' } }];
  engine.selectLiveTarget = () => victim;
  engine.updateStatus = () => {};
  let cleaned = 0, started = false;
  engine.skillTimeline = { play: async () => {
    started = true;
    assert.equal(engine.pendingTails.size, 0);
    assert.equal(actor.root.x, 0);
    assert.equal(victim.root.x, 100);
    actor.root.x = 33;
    return true;
  } };
  const skill = extractMethod(engineSrc, '  async playTacticalSkill(');
  engine.playTacticalSkill = new Function(`return ({${skill.trim()}}).playTacticalSkill`)();
  try {
    const pending = engine.timeline(tl => tl.to(actor.root, { x: 0, duration: .73 }, 0), () => {
      actor.root.x = 0;
      victim.root.x = 100;
      cleaned += 1;
    }, null, { releaseAt: .43, owners: [actor, victim] });
    const [{ instance }] = [...engine.simpleTimelines];
    instance.pause().totalTime(.43, false);
    await pending;
    assert.equal(await engine.playTacticalSkill(0), true);
    assert.equal(started, true);
    assert.equal(cleaned, 1);
    assert.equal(actor.root.x, 33, '이전 타격 cleanup 이 새 스킬 위치를 되돌리면 안 됩니다');
  } finally {
    engine.settlePendingTails([actor, victim]);
    gsap.ticker.sleep();
  }
});

test('호송·전직·보스 연출도 이전 타격 꼬리를 정리하지만 자체 조기 반환은 하지 않는다', () => {
  for (const [needle, owners] of [
    ['  escortObjectiveAttack(event=', '[actor]'],
    ['  async playAdvancementMoment(', '[participant]'],
    ['  async playApocalypseBossUltimate(', '[attacker,...targets]']
  ]) {
    const method = extractMethod(engineSrc, needle);
    assert.ok(method.includes(`this.settlePendingTails(${owners});`), `${needle} 에 이전 타격 정리가 없습니다`);
    assert.ok(!method.includes('releaseAt:'), '다른 연출까지 조기 반환 대상으로 확장하지 않습니다');
  }
});
