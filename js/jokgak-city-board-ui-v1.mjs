import {cityPlace} from '../shared/jokgak-city-v1.mjs';
import {CITY_DELIVERIES, CITY_SHIFT_GOALS, CITY_GOAL_COUNT, CITY_GOAL_CASH, CITY_EVENT_TARGET, CITY_EVENT_PAY,
  CITY_EVENT_PERSONAL_LIMIT, cityShiftIncident, cityIncidentDuty} from '../shared/jokgak-city-board-v1.mjs';

const place = code => cityPlace(code).name;
const button = (action, label, disabled, code='') => `<button type="button" data-city-action="${action}" ${code?'data-city-product="'+code+'"':''} ${disabled?'disabled':''}>${label}</button>`;
const travel = (code, blocked) => `<button type="button" data-city-board-go="${code}" ${blocked?'disabled':''}>${place(code)}로 이동</button>`;

export function cityBoardPanel(state, now, busy) {
  if (!state?.mine?.active || !state.board) return '<p class="jc-desk-empty">도시에 입장하면 이번 교대의 의뢰와 공동 사건에 참여할 수 있습니다.</p>';
  const me=state.mine, {personal,points}=state.board;
  const locked=busy||me.deadUntil>now||me.jailedUntil>now||me.hospitalRequired||me.restUntil>now;
  const at = (location, action, label, blocked=false) => me.location===location
    ? button(action,label,locked||blocked) : travel(location,locked||blocked);
  const incident=cityShiftIncident(personal.epoch), duty=cityIncidentDuty(me.role);
  const contracts=CITY_DELIVERIES.map(job=>{
    const current=personal.contract?.code===job.code, done=personal.completed.includes(job.code);
    const action=done?'<strong>납품 완료</strong>':current
      ? at(personal.contract.pickedUp?job.to:job.from,personal.contract.pickedUp?'finishDelivery':'pickupDelivery',personal.contract.pickedUp?'납품하기':'물품 수령')
        +button('cancelDelivery','의뢰 취소',locked)
      :button('acceptDelivery','의뢰 수락',locked||!!personal.contract,job.code);
    return `<article><h4>${job.name}</h4><p>${place(job.from)} → ${place(job.to)}</p><p>${job.cash}원${job.tickets?' · 식권 1장':''}</p><div>${action}</div></article>`;
  }).join('');
  let response;
  if(points>=CITY_EVENT_TARGET) response=personal.claimed?'보상 수령 완료':personal.contributed
    ?button('claimEvent',(personal.contributed*CITY_EVENT_PAY)+'원 수령',locked):'사건 해결 완료';
  else if(personal.contributed>=CITY_EVENT_PERSONAL_LIMIT) response='이번 교대의 개인 지원을 마쳤습니다.';
  else if(duty==='물자 운반'&&!personal.eventCargo)response=at(incident.depot,'collectEventCargo',incident.cargo+' 수령');
  else response=at(incident.site,'helpEvent',personal.nextHelpAt>now?'현장 지원 대기':duty+' 완료',personal.nextHelpAt>now);
  const goal=CITY_SHIFT_GOALS.find(g=>g.code===personal.goal);
  const goals=goal?`<p><strong>${goal.name} ${personal.progress}/${CITY_GOAL_COUNT}</strong> · ${goal.detail}</p>${personal.progress>=CITY_GOAL_COUNT?'<p>목표 보상 수령 완료</p>':''}`
    :`<p>이번 교대에 진행할 목표 하나를 선택하세요.</p><div class="jc-board-goals">${CITY_SHIFT_GOALS.map(g=>`<div>${button('chooseGoal',g.name,locked,g.code)}<span>${g.detail}</span></div>`).join('')}</div>`;
  return `<div class="jc-board"><p data-city-board-feedback role="status" hidden></p>
    <section><h3>배달 의뢰</h3><p>각 의뢰는 교대당 한 번 납품할 수 있습니다.</p><div class="jc-board-contracts">${contracts}</div>
    ${personal.tickets?`<div class="jc-board-ticket"><b>식권 ${personal.tickets}장</b> · 이번 교대에 사용 ${at('RESTAURANT','redeemTicket','식권으로 식사',me.nextActionAt>now)}</div>`:''}</section>
    <section><h3>공동 사건 · ${incident.name}</h3><p>${place(incident.site)} · 해결 진척 ${points}/${CITY_EVENT_TARGET} · 내 기여 ${personal.contributed}/${CITY_EVENT_PERSONAL_LIMIT}</p>
    <progress aria-label="공동 사건 해결 진척" value="${points}" max="${CITY_EVENT_TARGET}"></progress>
    <p>${duty==='물자 운반'?place(incident.depot)+'에서 '+incident.cargo+'를 받아 현장으로 운반하세요.':place(incident.site)+'에서 '+duty+' 활동에 참여하세요.'} 해결 후 교대가 끝나기 전까지 기여당 ${CITY_EVENT_PAY}원을 받을 수 있습니다.</p><div>${response}</div></section>
    <section><h3>교대 목표</h3><p>${CITY_GOAL_COUNT}회 달성 시 ${CITY_GOAL_CASH}원 자동 지급</p>${goals}</section></div>`;
}
