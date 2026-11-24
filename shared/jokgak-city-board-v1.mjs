import {cityShift} from './jokgak-city-v1.mjs';
import {changeCityCash} from './jokgak-city-cash-v1.mjs';

export const CITY_DELIVERIES = [
  {code:'FOOD', name:'식재료 배달', cargo:'식재료 상자', from:'DOCK', to:'RESTAURANT', cash:400, tickets:1},
  {code:'MEDICAL', name:'병원 보급', cargo:'구급품', from:'SHOP', to:'HOSPITAL', cash:800, tickets:0}
];
export const CITY_SHIFT_GOALS = [
  {code:'DELIVERY', name:'배달', detail:'배달 의뢰 납품 또는 시장 물품 배달·항구 상하차 근무 완료'},
  {code:'EXPLORE', name:'탐색', detail:'지역 탐색 완료'},
  {code:'ORDER', name:'치안', detail:'공동 사건 지원, 체포 성공 또는 순찰·행사 안내 근무 완료'},
  {code:'CARE', name:'구호', detail:'병원 보급 납품, 다른 시민 치료, 의료진 현장 지원 또는 병동·외래·주방 근무 완료'}
];
export const CITY_GOAL_COUNT = 2;
export const CITY_GOAL_CASH = 600;
export const CITY_EVENT_TARGET = 6;
export const CITY_EVENT_PERSONAL_LIMIT = 3;
export const CITY_EVENT_PAY = 350;
export const CITY_EVENT_COOLDOWN = 60000;
const incidents = [
  {name:'시장 정전', site:'MARKET', depot:'DOCK', cargo:'비상 전원 장비'},
  {name:'항구 물자 부족', site:'DOCK', depot:'SHOP', cargo:'긴급 보급품'}
];
export const cityShiftIncident = epoch => incidents[epoch % incidents.length];
export const cityIncidentDuty = role => role === 'POLICE' ? '현장 통제' : ['NURSE','DOCTOR'].includes(role) ? '응급 지원' : '물자 운반';
export const cityCivicActions = ['acceptDelivery','cancelDelivery','pickupDelivery','finishDelivery','chooseGoal','collectEventCargo','helpEvent','claimEvent'];

export function cityCivicState(life, mode, now) {
  const epoch = cityShift(now).id;
  const record = life.civic?.[mode];
  if (record?.epoch === epoch) return record;
  life.civic ??= {};
  return life.civic[mode] = {epoch, contract:null, completed:[], tickets:0, goal:null, progress:0,
    eventCargo:false, contributed:0, nextHelpAt:0, claimed:false};
}

export function civicError(message) {
  throw Object.assign(Error(message), {code:'CITY_BOARD', status:409});
}
export function completeCityDelivery(action, code, state, life, policy, me) {
  if (action === 'chooseGoal') {
    if (state.goal || !CITY_SHIFT_GOALS.some(goal => goal.code === code)) civicError('이번 교대에 진행할 목표 하나를 선택하세요.');
    state.goal = code;
    return {message:'교대 목표를 선택했습니다.'};
  }
  if (action === 'acceptDelivery') {
    if (state.contract || state.completed.includes(code) || !CITY_DELIVERIES.some(job => job.code === code)) civicError('현재 수락할 수 있는 의뢰를 선택하세요.');
    state.contract = {code, pickedUp:false};
    return {message:'의뢰를 수락했습니다. 수령처에서 물품을 받아 주세요.'};
  }
  const job = CITY_DELIVERIES.find(job => job.code === state.contract?.code);
  if (!job) civicError('먼저 도시 의뢰를 수락하세요.');
  if (action === 'cancelDelivery') {
    state.contract = null;
    return {message:'의뢰를 취소했습니다.'};
  }
  if (action === 'pickupDelivery') {
    if (state.contract.pickedUp || me.location !== job.from) civicError('의뢰 수령처에서 물품을 한 번만 받을 수 있습니다.');
    state.contract.pickedUp = true;
    return {message:job.cargo+' 수령 완료'};
  }
  if (action !== 'finishDelivery' || !state.contract.pickedUp || me.location !== job.to) civicError('물품을 받은 뒤 납품처로 이동하세요.');
  const cash = changeCityCash(life, policy, job.cash);
  state.tickets += job.tickets;
  state.completed.push(job.code);
  state.contract = null;
  return {delivery:job.code, cash, tickets:job.tickets, message:job.name+' 완료 · '+job.cash+'원'+(job.tickets?' · 식권 1장':'')};
}

const goalJobs = {DELIVERY:['DELIVERY','DOCK_LOAD'], EXPLORE:[], ORDER:['PATROL','EVENT_GUIDE'], CARE:['WARD','CLINIC','KITCHEN']};
export function creditCityGoal(life, policy, now, {action, work, civic, me, target, winner}) {
  const record = life.civic?.[policy.mode];
  if (!record?.goal || record.epoch !== cityShift(now).id || record.progress >= CITY_GOAL_COUNT) return null;
  const earned = work?.kind === 'workFinish' && goalJobs[record.goal].includes(work.code)
    || record.goal === 'DELIVERY' && action === 'finishDelivery'
    || record.goal === 'EXPLORE' && action === 'explore'
    || record.goal === 'ORDER' && (action === 'helpEvent' || action === 'arrest' && winner === 'A')
    || record.goal === 'CARE' && (civic?.delivery === 'MEDICAL' || action === 'heal' && me.userId !== target?.userId
      || action === 'helpEvent' && cityIncidentDuty(me.role) === '응급 지원');
  if (!earned) return null;
  record.progress++;
  if (record.progress < CITY_GOAL_COUNT) return null;
  return changeCityCash(life, policy, CITY_GOAL_CASH);
}

export function applyCityIncident(action, personal, points, life, policy, me, now) {
  if (action === 'claimEvent') {
    if (points < CITY_EVENT_TARGET || !personal.contributed || personal.claimed) civicError('사건 해결 후 기여한 시민이 교대 안에 한 번 수령할 수 있습니다.');
    const cash = changeCityCash(life, policy, personal.contributed * CITY_EVENT_PAY);
    personal.claimed = true;
    return {cash, message:'공동 사건 기여 보상 '+cash.change+'원 수령'};
  }
  if (points >= CITY_EVENT_TARGET || personal.contributed >= CITY_EVENT_PERSONAL_LIMIT) civicError('이번 사건에 추가로 기여할 수 없습니다.');
  const incident = cityShiftIncident(personal.epoch), duty = cityIncidentDuty(me.role);
  if (action === 'collectEventCargo') {
    if (duty !== '물자 운반' || me.location !== incident.depot || personal.eventCargo) civicError('보급처에서 운반할 물자를 한 번만 수령하세요.');
    personal.eventCargo = true;
    return {message:incident.cargo+' 수령 완료'};
  }
  if (me.location !== incident.site || duty === '물자 운반' && !personal.eventCargo) civicError('필요한 물자를 준비하고 사건 현장으로 이동하세요.');
  if (personal.nextHelpAt > now) civicError('현장 지원은 1분에 한 번 가능합니다.');
  personal.eventCargo = false;
  personal.contributed++;
  personal.nextHelpAt = now + CITY_EVENT_COOLDOWN;
  return {points:points+1, message:points+1===CITY_EVENT_TARGET?'공동 사건 해결 · 기여 보상을 수령하세요.':duty+' 완료 · 기여도 +1'};
}
