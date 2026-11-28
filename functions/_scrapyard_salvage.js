import {SCRAPYARD_REWARD_COIN_LIMIT} from '../shared/pve-reform-20261008.mjs';

export const SCRAPYARD_V3_DRAFT = Object.freeze({
  OUTER: Object.freeze({normalCount:9, simultaneous:3, maxActions:180, maxDuration:2, forcedMonsterEvery:6}),
  CORE: Object.freeze({normalCount:12, simultaneous:3, maxActions:240, maxDuration:2.5, forcedMonsterEvery:6}),
  FURNACE: Object.freeze({normalCount:15, simultaneous:3, maxActions:300, maxDuration:3, forcedMonsterEvery:6}),
  FURNACE_ELITE: Object.freeze({normalCount:15, simultaneous:3, maxActions:300, maxDuration:3, forcedMonsterEvery:6}),
  FURNACE_ABYSS: Object.freeze({normalCount:15, simultaneous:3, maxActions:300, maxDuration:3, forcedMonsterEvery:6})
});

const routes = [
  {key:'SORT', name:'선별 회수', powerPercent:85, extraEnemies:-2, payouts:[20,45,100]},
  {key:'DEEP', name:'심층 해체', powerPercent:130, extraEnemies:3, payouts:[10,30,125]}
];
const objectives = ['진입로 확보','부품 적재','수호기 해체'];

export function scrapyardRoute(difficulty, key='SORT', config=SCRAPYARD_V3_DRAFT[difficulty.id]) {
  const route = routes.find(row => row.key === key);
  if (!route) throw Object.assign(new Error('폐차장 작업 방식을 선택하세요.'), {code:'SCRAPYARD_V3_ROUTE'});
  const normalCount = Math.min(40, Math.max(5, config.normalCount + route.extraEnemies));
  const targets = [Math.ceil(normalCount / 3), Math.ceil(normalCount * 2 / 3), normalCount + 1];
  const scaled = power => Math.max(1000, Math.round(power * route.powerPercent / 100));
  return {
    key, name:route.name, normalCount, powerStart:scaled(difficulty.requiredPowerStart),
    powerEnd:scaled(difficulty.requiredPowerEnd), bossPower:scaled(difficulty.requiredPowerEnd * 1.08),
    checkpoints:objectives.map((name, i) => ({
      name, defeats:targets[i], coin:Math.min(SCRAPYARD_REWARD_COIN_LIMIT, Math.floor(difficulty.clearCoin * route.payouts[i] / 100))
    }))
  };
}

export function scrapyardRouteOptions(difficulty, config) {
  return routes.map(route => scrapyardRoute(difficulty, route.key, config));
}

export function salvageResult(route, defeated, success) {
  // The last checkpoint also requires the authoritative victory verdict.
  const completed = success ? 3 : route.checkpoints.slice(0, 2).filter(row => defeated >= row.defeats).length;
  return {...route, completed, coin:route.checkpoints[completed - 1]?.coin ?? 0};
}
