// V2060: 발동 연출(마법카드·고유효과 회복/불굴·회피·전직 배너)이 전투 재생을 멈추지 않는지 검증한다.
// 소스에서 playEvents / queueBanner / queueSupportEffect 를 그대로 뽑아 목 위에서 실행한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const engineSrc = read('preview/project-v-v3/source/battle/BattleEngine.js');
const bundleSrc = read('preview/project-v-v3/project-v-pixi-battle.bundle.js');
const appSrc = read('js/app.js');

// ---------------------------------------------------------------- 메서드 추출
function extractMethod(source, startNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `메서드를 찾지 못했습니다: ${startNeedle}`);
  // 매개변수 목록의 중괄호(구조분해)를 본문 시작으로 오해하지 않도록 괄호 균형부터 맞춘다.
  let i = source.indexOf('(', start);
  assert.notEqual(i, -1, `매개변수 목록을 찾지 못했습니다: ${startNeedle}`);
  let parens = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === '(') parens += 1;
    else if (source[i] === ')') {
      parens -= 1;
      if (parens === 0) { i += 1; break; }
    }
  }
  i = source.indexOf('{', i);
  assert.notEqual(i, -1, `본문 시작 중괄호를 찾지 못했습니다: ${startNeedle}`);
  let depth = 0, inStr = null, prev = '';
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (inStr) {
      if (ch === inStr && prev !== '\\') inStr = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
    prev = prev === '\\' && ch === '\\' ? '' : ch;
  }
  throw new Error(`본문 끝을 찾지 못했습니다: ${startNeedle}`);
}

const playEventsSrc = extractMethod(engineSrc, '  async playEvents(events=[]');
const queueBannerSrc = extractMethod(engineSrc, '  queueBanner(name,color=');
const queueSupportSrc = extractMethod(engineSrc, '  queueSupportEffect(targets,options=');
const advancePaceSrc = extractMethod(engineSrc, '  advancePace(type)');

// ---------------------------------------------------------------- 목 하네스
const BANNER_MS = 60;
const SUPPORT_MS = 30;
const ATTACK_MS = 20;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function buildHarness() {
  const helpers = {
    hasFiniteNumber: value => Number.isFinite(Number(value)) && value !== null && value !== '',
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    SKILL_EFFECT_KIND: { ATTACK: 'ATTACK', DEFENSE: 'DEFENSE', SPEED: 'SPEED', HP: 'HP' },
    normalizeAdvancementEffectCode: value => String(value || '').toUpperCase(),
    isSkillChipTimeline: () => false
  };
  const Harness = new Function('helpers', `
    const {hasFiniteNumber,clamp,SKILL_EFFECT_KIND,normalizeAdvancementEffectCode,isSkillChipTimeline}=helpers;
    return class Harness {
      constructor(log){
        this.log=log;
        this.bannerQueue=[];
        this.bannerPump=null;
        this.visible=true;
        this.paceActions=0;
        this.paceScale=1;
        this.livePayload=true;
        this.apocalypseMode=false;
        this.cards=[{data:{}}];
        this.target={id:'T1',name:'target',hp:100,maxHp:100};
        this.allies=[this.target];
        this.enemies=[];
        this.currentAllyTarget=this.target;
        this.maxQueueSeen=0;
      }
      ${advancePaceSrc.trim()}
      ${queueBannerSrc.trim()}
      ${queueSupportSrc.trim()}
      ${playEventsSrc.trim()}
      combatantById(id){return id===this.target.id?this.target:null}
      eventHpPercent(target,value){return hasFiniteNumber(value)?Number(value):null}
      isAlive(){return true}
      isAccountBattleUnitDamageEvent(){return false}
      updateStatus(){}
      syncTargetShield(){}
      syncTargetHp(target,percent){this.log.push({at:Date.now(),op:'hp',value:percent})}
      showBanner(name){
        this.maxQueueSeen=Math.max(this.maxQueueSeen,this.bannerQueue.length);
        this.log.push({at:Date.now(),op:'banner',value:name});
        return new Promise(resolve=>setTimeout(resolve,${BANNER_MS}));
      }
      playSupportEffect(){
        this.log.push({at:Date.now(),op:'support'});
        return new Promise(resolve=>setTimeout(resolve,${SUPPORT_MS}));
      }
      normalAttack(index,{targetHp=null}={}){
        this.log.push({at:Date.now(),op:'attack'});
        if(hasFiniteNumber(targetHp))this.syncTargetHp(this.target,targetHp);
        return new Promise(resolve=>setTimeout(resolve,${ATTACK_MS}));
      }
      playTacticalSkill(){return this.normalAttack(0,{})}
      deployCards(){return Promise.resolve(true)}
      playAdvancementMoment(){return Promise.resolve(true)}
      playUltimate(){return Promise.resolve(true)}
      bossCounter(){return Promise.resolve(true)}
      playApocalypseBossUltimate(){return Promise.resolve(false)}
      escortObjectiveAttack(){return Promise.resolve(true)}
      syncObjectiveHud(){}
      queueAccountBattleUnitDamageShot(){return Promise.resolve(true)}
    };
  `)(helpers);
  const log = [];
  return { engine: new Harness(log), log };
}

const regen = hpAfter => ({ type: 'REGEN', targetId: 'T1', hpAfter, amount: 5, label: '생명형 · 지속 회복' });
const attack = hpAfter => ({ type: 'TURN', actorIndex: 0, targetId: 'T1', damage: 1000, targetHpAfter: hpAfter });
const magicStatus = hpAfter => ({ type: 'MAGIC_CARD', actorIndex: 0, targetId: 'T1', damage: 0, magicName: '봉인', targetHpAfter: hpAfter });

// ---------------------------------------------------------------- 테스트
test('회복·상태 이벤트가 전투 재생을 멈추지 않는다', async () => {
  const { engine, log } = buildHarness();
  const events = [];
  for (let i = 0; i < 10; i += 1) events.push(regen(90 - i));
  const started = Date.now();
  await engine.playEvents(events);
  const elapsed = Date.now() - started;

  // 패치 전에는 이벤트마다 지원이펙트 + 배너를 await 했으므로 10 * (30+60) = 900ms 이상 걸렸다.
  assert.ok(elapsed < 120, `10회 회복 이벤트가 ${elapsed}ms 를 잡아먹었습니다 (논블로킹이면 즉시 끝나야 함)`);
  assert.equal(log.filter(row => row.op === 'hp').length, 10, 'HP 는 이벤트마다 즉시 반영되어야 합니다');
});

test('회피 배너가 전투를 멈추지 않는다', async () => {
  const { engine } = buildHarness();
  const events = [];
  for (let i = 0; i < 8; i += 1) events.push({ type: 'TURN', actorIndex: 0, targetId: 'T1', dodge: true });
  const started = Date.now();
  await engine.playEvents(events);
  assert.ok(Date.now() - started < 120, '회피 이벤트는 배너를 기다리지 않아야 합니다');
});

test('HP 동기화가 이벤트 순서를 지키고, 재생이 끝난 뒤 뒤늦게 되돌아가지 않는다', async () => {
  const { engine, log } = buildHarness();
  await engine.playEvents([regen(90), attack(40), regen(55), attack(20), magicStatus(18)]);
  const before = log.filter(row => row.op === 'hp').map(row => row.value);
  assert.deepEqual(before, [90, 40, 55, 20, 18], 'HP 반영 순서가 이벤트 순서와 같아야 합니다');

  // 논블로킹 연출이 뒤늦게 onImpact 로 HP 를 되돌리면 안 된다 (v1990 회귀 방지).
  await wait(BANNER_MS * 4);
  const after = log.filter(row => row.op === 'hp').map(row => row.value);
  assert.deepEqual(after, before, '재생 종료 후 추가 HP 쓰기가 발생하면 안 됩니다');
});

test('배너 대기열은 최신 2건만 유지한다', async () => {
  const { engine } = buildHarness();
  const events = [];
  for (let i = 0; i < 12; i += 1) events.push(regen(90 - i));
  await engine.playEvents(events);
  assert.ok(engine.bannerQueue.length <= 2, `대기열이 ${engine.bannerQueue.length} 건까지 쌓였습니다`);
  assert.ok(engine.maxQueueSeen <= 2, '배너가 전투보다 뒤처지도록 무한히 쌓이면 안 됩니다');
  engine.visible = false;
  await wait(BANNER_MS * 3);
});

test('큰 연출(스킬·궁극기·전직 순간)은 여전히 차단 재생을 유지한다', async () => {
  const { engine } = buildHarness();
  const started = Date.now();
  await engine.playEvents([
    { type: 'SKILL', actorIndex: 0, targetId: 'T1', damage: 5000, targetHpAfter: 70 },
    { type: 'ATTACK', actorIndex: 0, targetId: 'T1', damage: 5000, targetHpAfter: 40 }
  ]);
  assert.ok(Date.now() - started >= ATTACK_MS * 2 - 5, '타격 연출까지 논블로킹으로 바뀌면 안 됩니다');
});

test('소스 계약: 반복 이벤트는 queue*, 큰 연출은 await 유지', () => {
  assert.match(engineSrc, /queueBanner\(name,color=0xffd43d,label='전술 스킬 발동'\)\{/);
  assert.match(engineSrc, /queueSupportEffect\(targets,options=\{\}\)\{/);
  assert.match(engineSrc, /this\.bannerQueue=\[\];\s*\n\s*this\.bannerPump=null;/);
  assert.match(engineSrc, /this\.playbackEpoch\+=1;\s*\n\s*this\.bannerQueue\.length=0;/);
  // 반복 발동 이벤트는 전부 논블로킹이어야 한다.
  assert.match(engineSrc, /this\.queueBanner\('회피 · 잔상 전개'/);
  assert.match(engineSrc, /this\.queueBanner\(type==='TEAM_HEAL'\?'아군 회복'/);
  assert.match(engineSrc, /this\.queueSupportEffect\(supportTargets,\{/);
  assert.match(engineSrc, /this\.queueBanner\(label,event\.amount\?0x6affb7:0xb57cff/);
  assert.match(engineSrc, /this\.queueBanner\(event\.label\|\|'불멸자 · 최후 저항'/);
  assert.match(engineSrc, /this\.queueBanner\(event\.label\|\|'불멸자 · 부활 봉인'/);
  // playEvents 안에 남는 차단 배너는 호송차 긴급 복구 하나뿐이다.
  // (카드 발동 연출이 아니라 목표물 tint 플래시를 유지해야 하는 1회성 연출)
  const playEventsOnly = playEventsSrc;
  const blockingBanners = playEventsOnly.match(/await this\.showBanner\([^\n]*/g) || [];
  assert.equal(blockingBanners.length, 1, 'playEvents 안에서 카드 발동 배너를 기다리면 안 됩니다');
  assert.match(blockingBanners[0], /호송차 긴급 복구/);
  assert.ok(!/await this\.playSupportEffect/.test(playEventsOnly), 'playEvents 안에서 지원 이펙트를 기다리면 안 됩니다');
  // 큰 연출은 그대로 차단 유지.
  assert.match(playEventsOnly, /await this\.normalAttack\(/);
  assert.match(playEventsOnly, /await this\.playTacticalSkill\(/);
  assert.match(playEventsOnly, /await this\.playAdvancementMoment\(/);
});

test('번들이 소스와 같은 계약을 담고 있다', () => {
  assert.ok(bundleSrc.includes('queueBanner('), '번들에 queueBanner 가 없습니다');
  assert.ok(bundleSrc.includes('queueSupportEffect('), '번들에 queueSupportEffect 가 없습니다');
  assert.ok(bundleSrc.includes('this.bannerQueue=[],this.bannerPump=null'), '번들 생성자에 배너 큐 초기화가 없습니다');
  assert.ok(bundleSrc.includes('this.playbackEpoch+=1,this.bannerQueue.length=0'), '번들 cancelTimelines 에 큐 비우기가 없습니다');
  assert.equal((bundleSrc.match(/queueBanner\(/g) || []).length, 8, '번들의 queueBanner 호출 수가 소스와 다릅니다');
  assert.equal((bundleSrc.match(/queueSupportEffect\(/g) || []).length, 3, '번들의 queueSupportEffect 호출 수가 소스와 다릅니다');
  // 정의 1 + 배너펌프 1 + 호송 1 + ZENITH 궁극기 1
  assert.equal((bundleSrc.match(/await this\.showBanner\(/g) || []).length, 3, '번들에 남은 차단 배너 수가 소스와 다릅니다');
});

test('캐시 태그가 갱신되어 있다', () => {
  assert.match(appSrc, /project-v-pixi-battle\.bundle\.js\?v=101-nonblocking-fx/);
  assert.match(read('service-worker.js'), /const SHELL_CACHE='soop-card-shell-v2060-nonblocking-fx'/);
});

test('숨겨진 전투에 배너를 넣어도 큐가 잠기지 않고 다시 열면 재생된다', async () => {
  const { engine, log } = buildHarness();
  engine.visible = false;
  assert.equal(engine.queueBanner('닫힌 전투'), false);
  await Promise.resolve();
  assert.equal(engine.bannerPump, null);
  assert.equal(engine.bannerQueue.length, 0);
  engine.visible = true;
  engine.queueBanner('새 전투');
  await engine.bannerPump;
  assert.deepEqual(log.filter(row => row.op === 'banner').map(row => row.value), ['새 전투']);
});

test('배너 생성이 동기 예외를 내도 다음 배너를 재생할 수 있다', async t => {
  const { engine, log } = buildHarness();
  t.mock.method(console, 'warn', () => {});
  const showBanner = engine.showBanner;
  engine.showBanner = () => { throw new Error('test banner error'); };
  engine.queueBanner('실패');
  await engine.bannerPump;
  assert.equal(engine.bannerPump, null);
  engine.showBanner = showBanner;
  engine.queueBanner('복구');
  await engine.bannerPump;
  assert.equal(log.at(-1).value, '복구');
});

function buildBannerHarness() {
  const method = extractMethod(engineSrc, '  showBanner(name,color=');
  const showBanner = new Function(`return ({${method.trim()}}).showBanner`)();
  const log = [], pending = [];
  const banner = { nameText: { style: {} }, typeText: {}, glow: {}, scale: {}, alpha: 0 };
  const engine = {
    showBanner, visible: true, playbackEpoch: 0, bannerPlayback: null,
    uiLayer: { banner },
    timeline(build, cleanup) {
      log.push(banner.nameText.text);
      banner.alpha = 1;
      return new Promise(resolve => pending.push(() => { cleanup(); resolve(true); }));
    }
  };
  return { engine, log, pending, banner };
}

test('논블로킹 배너와 궁극기 배너가 같은 표시 객체를 덮어쓰지 않는다', async () => {
  const { engine, log, pending, banner } = buildBannerHarness();
  const support = engine.showBanner('회복');
  await Promise.resolve();
  const ultimate = engine.showBanner('궁극기');
  await Promise.resolve();
  assert.deepEqual(log, ['회복']);
  assert.equal(banner.nameText.text, '회복');
  pending.shift()();
  await support;
  await Promise.resolve();
  assert.deepEqual(log, ['회복', '궁극기']);
  assert.equal(banner.nameText.text, '궁극기');
  pending.shift()();
  await ultimate;
  assert.equal(engine.bannerPlayback, null);
  assert.equal(banner.alpha, 0);
});

test('전투가 취소되면 아직 시작하지 않은 배너는 다음 전투에 나타나지 않는다', async () => {
  const { engine, log, pending } = buildBannerHarness();
  const first = engine.showBanner('진행 중');
  await Promise.resolve();
  const stale = engine.showBanner('취소될 대기 배너');
  engine.playbackEpoch += 1;
  engine.bannerPlayback = null;
  pending.shift()();
  await first;
  assert.equal(await stale, false);
  assert.deepEqual(log, ['진행 중']);
  const next = engine.showBanner('새 전투');
  await Promise.resolve();
  pending.shift()();
  await next;
  assert.deepEqual(log, ['진행 중', '새 전투']);
});
