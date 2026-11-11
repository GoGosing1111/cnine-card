import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('function attendanceProgress(');
const end = app.indexOf('let rankedChallengerFxLoading', start);
const context = vm.createContext({
  kstDateKey: () => '2026-11-11',
  summaryBar: () => '',
  window: {},
  attendanceClaimInFlight: false,
  couponRedeemInFlight: false,
});
vm.runInContext(app.slice(start, end), context);

test('the weekly calendar reflects the earned day, a missed KST day and the seven-day rollover', () => {
  const cases = [
    [null, 0, 1, 0, false],
    ['2026-11-09', 6, 1, 0, false],
    ['2026-11-10', 1, 2, 1, false],
    ['2026-11-10', 7, 1, 7, false],
    ['2026-11-11', 2, 2, 2, true],
    ['2026-11-11', 7, 7, 7, true],
    ['2026-11-11', undefined, 1, 1, true],
  ];
  for (const [lastClaimDate, previous, day, streak, claimed] of cases) {
    const progress = context.attendanceProgress({lastClaimDate, streak: previous});
    assert.deepEqual([progress.day, progress.streak, progress.claimed], [day, streak, claimed]);
  }
  assert.equal(context.attendanceProgress({lastClaimDate: '2026-12-31', streak: 3}, '2027-01-01').day, 4);
});

test('the board, amount and claim action use the same daily settings including zero and pauses', () => {
  const attendance = {lastClaimDate: '2026-11-10', streak: 1, totalDays: 13, settings: {rewards: [79, 0, 7890123]}};
  const view = () => context.attendanceView({attendance});
  assert.match(view(), /class="attendance-amount"[^]*?<strong>0<\/strong>/);
  assert.match(view(), /3일차 · 7,890,123코인 · 예정/);
  assert.match(view(), /2일차 · 0코인 · 수령 가능/);
  assert.equal((view().match(/<li /g) || []).length, 7);
  assert.match(view(), /id="couponCode"[^>]*maxlength="40"/);
  attendance.settings.enabled = false;
  assert.match(view(), /id="claimAttendance"[^>]*disabled[^>]*>출석 보상 일시 중지/);
  attendance.settings.enabled = true;
  attendance.lastClaimDate = '2026-11-11';
  attendance.streak = 2;
  assert.match(view(), /id="claimAttendance"[^>]*disabled[^>]*>오늘 보상 수령 완료/);
  assert.match(view(), /aria-current="date" aria-label="2일차 · 0코인 · 수령 완료"/);
});
