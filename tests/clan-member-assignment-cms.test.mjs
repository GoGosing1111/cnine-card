import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAssignmentTarget, validateAssignmentPreview, AdmissionSession} from '../admin/clan-member-assignment.js';

const target = {userId:7, nickname:'테스트 계정', clanId:3, clanName:'T1', seasonId:9};
const state = {season:{id:9, phase:'ACTIVE'}, clans:[{id:3, name:'T1', active:true}]};
const users = {users:[{id:7, nickname:'테스트 계정', status:'ACTIVE'}]};
const preview = {...target, ok:true, previewId:'test-preview-123456789', confirmation:'ASSIGN_UNAFFILIATED_CLAN_MEMBER',
  verified:true, rankedDeckReady:true, currentMembership:null, gift:null, removals:[], memberCount:21, afterCount:22, maxMembers:22};
const result = {...target, ok:true, previewId:preview.previewId, memberRole:'MEMBER', removedCount:0, gift:null,
  completedAt:'2026-09-06T12:00:00Z', memberCount:22, maxMembers:22};

test('resolves only the exact active account, clan and season identity', () => {
  assert.deepEqual(resolveAssignmentTarget(users, state, '테스트 계정', 3), target);
  assert.throws(() => resolveAssignmentTarget(users, state, '테스트', 3));
  assert.throws(() => resolveAssignmentTarget({users:[...users.users, ...users.users]}, state, '테스트 계정', 3));
  assert.throws(() => resolveAssignmentTarget(users, {...state, season:{id:9, phase:'COMPLETE'}}, '테스트 계정', 3));
  assert.throws(() => resolveAssignmentTarget({users:[{...users.users[0], status:'BANNED'}]}, state, '테스트 계정', 3));
});

test('rejects altered identities, transfers, gifts, removals and capacity overflow', () => {
  assert.equal(validateAssignmentPreview(preview, target), preview);
  for (const altered of [{userId:8}, {confirmation:'TRANSFER_EXPLICIT_CLAN_MEMBER'}, {gift:{amount:1}},
    {removals:[{userId:8}]}, {currentMembership:{clanId:4}}, {verified:false}, {rankedDeckReady:false}, {afterCount:23}, {maxMembers:23}]) {
    assert.throws(() => validateAssignmentPreview({...preview, ...altered}, target));
  }
});

test('lost apply response and page reload reuse the same receipt, without new admission', async () => {
  let saved, calls = [], loseResponse = true;
  const request = async (path, body) => {
    calls.push({path, body});
    if (body.action === 'preview') return preview;
    if (loseResponse) { loseResponse = false; throw new Error('network timeout'); }
    return result;
  };
  const session = new AdmissionSession(request, value => { saved = structuredClone(value); });
  await session.preview(target);
  await assert.rejects(session.apply(), /network timeout/);
  assert.equal(saved.started, true);
  await assert.rejects(session.preview(target), /먼저/);
  const recovered = new AdmissionSession(request, value => { saved = structuredClone(value); }, saved);
  assert.deepEqual(await recovered.apply(), result);
  assert.deepEqual(calls.map(call => call.body.action), ['preview', 'apply', 'apply']);
  assert.deepEqual(calls[1].body, calls[2].body);
  assert.deepEqual(Object.keys(calls[1].body).sort(), ['action', 'confirmation', 'previewId']);
  await recovered.apply();
  assert.equal(calls.length, 3);
});

test('a failed browser receipt save cannot start a membership write', async () => {
  let calls = 0;
  const session = new AdmissionSession(async () => { calls++; }, () => { throw new Error('storage unavailable'); }, {preview, started:false});
  await assert.rejects(session.apply(), /storage unavailable/);
  assert.equal(calls, 0);
});

test('server identity mismatch is not reported as completion', async () => {
  const session = new AdmissionSession(async () => ({...result, userId:8}), () => {}, {preview, started:false});
  await assert.rejects(session.apply(), /완료 응답/);
  assert.equal(session.receipt.started, true);
  assert.equal(session.receipt.result, undefined);
});
