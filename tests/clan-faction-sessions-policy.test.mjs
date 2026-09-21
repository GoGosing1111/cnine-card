import test from 'node:test';
import assert from 'node:assert/strict';
import {FACTION_SESSION_RELEASE, FACTION_SESSION_RULES, factionPolicy, factionDayKey, factionDayStart, createFactionDay, factionSessionRewards} from '../shared/clan-faction-sessions-v1.mjs';
import {factionSessionStrip} from '../js/clan-faction-sessions-v1.mjs';

test('disabled release has no policy and incomplete economic choices cannot be activated', () => {
  assert.equal(factionPolicy({enabled:false}), null);
  assert.doesNotThrow(() => factionPolicy(FACTION_SESSION_RELEASE));
  for(const key of ['effectiveAt','recipients','interruption','mapPolicy'])
    assert.throws(() => factionPolicy({enabled:true,effectiveAt:0,recipients:'ALL_MEMBERS',interruption:'CANCEL',mapPolicy:'RESET',[key]:null}), /NOT_APPROVED/);
  assert.equal(FACTION_SESSION_RULES.coinPerRecipient, 300 * 100000000);
  assert.equal(FACTION_SESSION_RELEASE.recipients,'PARTICIPANTS');
  assert.equal(FACTION_SESSION_RELEASE.interruption,'PAUSE');
  assert.equal(FACTION_SESSION_RELEASE.overlap,'DEFER');
  assert.equal(FACTION_SESSION_RELEASE.mapPolicy,'KEEP');
});
test('random pair covers a KST day without overlaps, midnight spill or retry dependence', () => {
  const key = '2026-09-22', start = factionDayStart(key), max = 1081 * 1082 / 2;
  for (const seed of [0, 1, 1080, 1081, Math.floor(max / 2), max - 1]) {
    const slots = createFactionDay(key, () => seed);
    assert.equal(slots.length, 2);
    assert.ok(slots[0].startsAt >= start);
    assert.ok(slots[0].endsAt <= slots[1].startsAt);
    assert.ok(slots[1].endsAt <= start + 86400000);
    for (const slot of slots) assert.equal(slot.endsAt - slot.startsAt, 10800000);
    assert.deepEqual(slots, createFactionDay(key, () => seed));
  }
  assert.equal(factionDayKey(Date.parse('2026-09-21T14:59:59Z')), '2026-09-21');
  assert.equal(factionDayKey(Date.parse('2026-09-21T15:00:00Z')), '2026-09-22');
  assert.throws(() => createFactionDay('2026-02-30'), /INVALID/);
});
test('four holdings grant once, not per territory; three holdings grant nothing', () => {
  const districts = [...Array(8)].map(() => ({owner: 1})).concat([...Array(3)].map(() => ({owner: 2})));
  const roster = [{userId:1,clanId:1},{userId:2,clanId:1},{userId:3,clanId:2}];
  const all = factionSessionRewards(districts, roster, [1], {recipients:'ALL_MEMBERS'});
  assert.deepEqual(all.recipients.map(r=>[r.userId,r.amount]), [[1,30000000000],[2,30000000000]]);
  assert.equal(factionSessionRewards(districts, roster, [1], {recipients:'PARTICIPANTS'}).recipients.length, 1);
  assert.equal(factionSessionRewards(districts, roster, [], {recipients:'CLAN_TOTAL'}).recipients.reduce((n,r)=>n+r.amount,0),30000000000);
});

test('midnight is displayed as the end of the same KST day, not an earlier closing time', () => {
  const schedule=createFactionDay('2026-09-22',max=>max-1);
  const html=factionSessionStrip({sessions:{active:false,nextStartsAt:schedule[0].startsAt,schedule}});
  assert.match(html,/21:00 — 24:00/);
});
