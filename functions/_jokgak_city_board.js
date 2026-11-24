import {CITY_EVENT_TARGET, cityCivicState, applyCityIncident, completeCityDelivery} from '../shared/jokgak-city-board-v1.mjs';
import {cityGuard, cityGuardEnd} from './_jokgak_city_rewards.js';

const eventKey = (mode, epoch) => 'jokgak_city_district_event_v1:'+mode+':'+epoch;
async function eventRecord(env, mode, epoch) {
  const key = eventKey(mode, epoch);
  const row = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  const points = row ? JSON.parse(row.value).points : 0;
  if (!Number.isSafeInteger(points) || points < 0 || points > CITY_EVENT_TARGET) throw Error('Invalid city event progress');
  return {key, raw:row?.value, points};
}
export async function cityBoardView(env, life, policy, now) {
  if (!life) return null;
  const personal = cityCivicState(life, policy.mode, now);
  const {points} = await eventRecord(env, policy.mode, personal.epoch);
  return {personal, points};
}

export async function prepareCityBoard(env, {action, code, life, policy, me, now, requestId}) {
  const personal = cityCivicState(life, policy.mode, now);
  if (!['collectEventCargo','helpEvent','claimEvent'].includes(action)) {
    return {result:completeCityDelivery(action, code, personal, life, policy, me), statements:[]};
  }
  const {key, raw, points} = await eventRecord(env, policy.mode, personal.epoch);
  const result = applyCityIncident(action, personal, points, life, policy, me, now);
  if (action !== 'helpEvent') return {result, statements:[]};
  const next = JSON.stringify({points:result.points, lastRequest:requestId});
  const write = raw == null
    ? env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key,next)
    : env.DB.prepare('UPDATE app_meta SET value=? WHERE key=? AND value=?').bind(next,key,raw);
  const tag = requestId+':district';
  return {result, statements:[write,cityGuard(env,tag,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,next]),cityGuardEnd(env,tag)]};
}
