const contracts = [
  {key:'RELIEF', name:'구호 물자', difficulty:'일반', powerPercent:70, hazardPercent:70, payPercent:85},
  {key:'FREIGHT', name:'산업 부품', difficulty:'정예', powerPercent:100, hazardPercent:100, payPercent:100},
  {key:'PRIORITY', name:'특수 화물', difficulty:'위험', powerPercent:180, hazardPercent:135, payPercent:160}
];

// Freeze the selected manifest at departure. Later CMS edits apply to new runs.
export function escortContract(cfg, key='FREIGHT') {
  const contract = contracts.find(row => row.key === key);
  if (!contract) throw new RangeError('수송할 화물을 선택하세요.');
  const pay = (value, cap) => Math.min(cap, Math.round(value * contract.payPercent / 100));
  return {
    ...contract, repairPercent:cfg.repairPercent, vehicleStrikeScale:cfg.vehicleStrikeScale,
    clearBonusCoin:pay(cfg.clearBonusCoin, 2000000000), clearBonusShards:pay(cfg.clearBonusShards, 1000000),
    sectors:cfg.sectors.map(sector => ({
      ...sector, enemyPower:Math.max(1000, Math.min(2000000000, Math.round(sector.enemyPower * contract.powerPercent / 100))),
      hazardPercent:Math.min(90, Math.round(sector.hazardPercent * contract.hazardPercent / 100)),
      rewardCoin:pay(sector.rewardCoin, 2000000000), rewardShards:pay(sector.rewardShards, 1000000),
      rewardStars:pay(sector.rewardStars, 10000000), rewardTickets:0
    }))
  };
}

export function escortContractOptions(cfg) {
  return contracts.map(contract => escortContract(cfg, contract.key));
}

export function deliveryGrade(hp, maxHp) {
  const ratio = hp / Math.max(1, maxHp);
  if (ratio >= .8) return {name:'최우수', bonusPercent:100};
  if (ratio >= .5) return {name:'우수', bonusPercent:80};
  return {name:'일반', bonusPercent:60};
}
