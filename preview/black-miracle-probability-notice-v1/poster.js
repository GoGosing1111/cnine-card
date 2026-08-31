const snapshotUrl = './cms-snapshot-v1.json?v=1';
const captureMode = new URLSearchParams(location.search).get('poster');
if (['cover', 'equipment', 'vehicle', 'rules'].includes(captureMode)) {
  document.documentElement.dataset.capture = captureMode;
}

const formatPercent = (value, digits = 6) => `${Number(value).toFixed(digits)}%`;
const formatPower = (value) => Number(value).toLocaleString('ko-KR');
const sumRates = (rows) => rows.reduce((sum, row) => sum + Number(row.ratePercent || 0), 0);

function summaryCard({ code, label, detail, rate, accent }) {
  return `<article class="summary-card ${accent}"><span>${code}</span><b>${label}</b><small>${detail}</small><strong>${formatPercent(rate)}</strong></article>`;
}

function rateRow(row, index) {
  return `<div class="rate-row"><span class="rate-index">${String(index + 1).padStart(2, '0')}</span><b>${row.name}</b><small>총 ${formatPower(row.totalPower)}<i>PVE ${formatPower(row.pvePower)} · PVP ${formatPower(row.pvpPower)}</i></small><strong>${formatPercent(row.ratePercent)}</strong></div>`;
}

function sourceCard(row) {
  return `<article><span>${row.key.replace('_', ' ')}</span><b>${row.label}</b><strong>${formatPercent(row.ratePercent, row.ratePercent < 0.001 ? 5 : 3)}</strong><small>${row.enabled ? 'ON' : 'OFF'} · ${row.quantity}개</small></article>`;
}

function assertSnapshot(data) {
  const equipment = sumRates(data.equipmentPool);
  const vehicle = sumRates(data.vehiclePool);
  const rare = equipment + vehicle;
  const expected = data.probabilityModel.effectiveSummaryPercent;
  const tolerance = 0.00000002;
  if (data.pack.inventoryOpenEnabled !== false) throw new Error('CMS 개봉 상태가 스냅샷과 다릅니다.');
  if (data.equipmentPool.length !== 17 || data.vehiclePool.length !== 14) throw new Error('활성 보상 풀 개수가 다릅니다.');
  if (Math.abs(equipment - expected.mythicEquipment) > tolerance) throw new Error('신화 장비 확률 합계가 다릅니다.');
  if (Math.abs(vehicle - expected.mythicVehicle) > tolerance) throw new Error('신화 이동수단 확률 합계가 다릅니다.');
  if (Math.abs(rare - expected.rareTotal) > tolerance) throw new Error('희귀 보상 확률 합계가 다릅니다.');
  const total = expected.mythicEquipment + expected.mythicVehicle + expected.masterStar + expected.coin;
  if (Math.abs(total - 100) > tolerance) throw new Error('전체 보상 확률 합계가 100%가 아닙니다.');
  return { equipment, vehicle, rare, total };
}

async function render() {
  const response = await fetch(snapshotUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('CMS 스냅샷을 불러오지 못했습니다.');
  const data = await response.json();
  const totals = assertSnapshot(data);
  const summary = data.probabilityModel.effectiveSummaryPercent;

  document.querySelector('#summaryGrid').innerHTML = [
    summaryCard({ code: 'MYTHIC EQUIPMENT', label: '신화 장비', detail: `${data.equipmentPool.length}종`, rate: summary.mythicEquipment, accent: 'cyan' }),
    summaryCard({ code: 'MYTHIC VEHICLE', label: '신화 이동수단', detail: `${data.vehiclePool.length}종 · 미보유 기준`, rate: summary.mythicVehicle, accent: 'violet' }),
    summaryCard({ code: 'MASTER STAR', label: '마스터의 별', detail: `${formatPower(data.rewards.masterStar.min)} ~ ${formatPower(data.rewards.masterStar.max)}개`, rate: summary.masterStar, accent: 'gold' }),
    summaryCard({ code: 'SOOP COIN', label: '코인', detail: `${formatPower(data.rewards.coin.min)} ~ ${formatPower(data.rewards.coin.max)}`, rate: summary.coin, accent: 'warm' }),
  ].join('');

  document.querySelector('#equipmentRows').innerHTML = data.equipmentPool.map(rateRow).join('');
  document.querySelector('#vehicleRows').innerHTML = data.vehiclePool.map(rateRow).join('');
  document.querySelector('#equipmentTotal').textContent = formatPercent(totals.equipment);
  document.querySelector('#vehicleTotal').textContent = formatPercent(totals.vehicle);
  document.querySelector('#equipmentExcluded').textContent = data.excludedFromPool.equipment.join(' · ');
  document.querySelector('#vehicleExcluded').textContent = data.excludedFromPool.vehicle.join(' · ');
  document.querySelector('#sourceGrid').innerHTML = data.contentDropSources.map(sourceCard).join('');
  document.querySelector('#starRate').textContent = formatPercent(summary.masterStar);
  document.querySelector('#coinRate').textContent = formatPercent(summary.coin);
  document.querySelector('#validationState').textContent = `검증 완료 · ${data.equipmentPool.length + data.vehiclePool.length}종 · ${formatPercent(totals.total)}`;
  document.documentElement.dataset.ready = 'true';
}

render().catch((error) => {
  document.querySelector('#validationState').textContent = `검증 실패 · ${error.message}`;
  document.documentElement.dataset.ready = 'error';
  console.error(error);
});
