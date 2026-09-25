import { MERCENARY_FUSION_POLICY as POLICY, MERCENARY_FUSION_RELEASE_ENABLED } from '../shared/mercenary-fusion-policy-v1.mjs';
import { MERCENARY_RANKS } from '../shared/mercenary-ranks-v1.mjs';
import { mercenaryGradePools, mercenaryCardChances, validateMercenaryCardRules } from '../shared/mercenary-draw-policy-v1.mjs';
import { MERCENARY_CMS_SEED as SEED } from './_mercenary_cms_seed.js';
import { readMercenaryDocument } from './_mercenary_account.js';
import { mercenaryRandomInt, mercenaryCardAcquisitionStatements } from './_mercenary_draw_accounting.js';
import { runJointOperation, readJointOperation } from './_joint_transactions.js';
import { jointGuard, jointGuardEnd } from './_joint_atomic.js';
import { readJointBody, jointError, jointResponseError } from './_joint_request.js';

const KIND = 'MERCENARY_FUSION';
const catalogCodes = SEED.catalog.cards.map(c => c.code);
const fail = (code, message, status = 400) => jointError(code, message, status);
export function normalizeFusionMaterials(value) {
  if (!Array.isArray(value) || value.length !== POLICY.materialCount || value.some(code => typeof code !== 'string' || !catalogCodes.includes(code)))
    throw fail('MERCENARY_FUSION_MATERIALS', '등록된 용병의 중복 카드 8장을 선택하세요.');
  const counts = new Map();
  for (const code of value) counts.set(code, (counts.get(code) || 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([code, quantity]) => ({ code, quantity }));
}
export function pickFusionResult({ rank, pools, rules, randomInt = mercenaryRandomInt }) {
  const index = MERCENARY_RANKS.indexOf(rank), next = MERCENARY_RANKS[index + 1];
  if (index < 0 || !next) throw fail('MERCENARY_FUSION_MAX_RANK', 'SSS 등급은 합성 재료로 사용할 수 없습니다.');
  if (!pools[rank]?.length || !pools[next]?.length) throw fail('MERCENARY_FUSION_POOL_EMPTY', '결과 등급의 용병이 준비되지 않았습니다.', 409);
  const sample = max => { const n = randomInt(max); if (!Number.isSafeInteger(n) || n < 0 || n >= max) throw Error('Invalid fusion random result'); return n; };
  const promoted = sample(POLICY.chanceTotal) < POLICY.successChancePpm, resultRank = promoted ? next : rank;
  const choices = mercenaryCardChances(POLICY.chanceTotal, pools[resultRank], rules);
  let ticket = sample(choices[0].totalWeight);
  const selected = choices.find(c => { ticket -= c.weight; return ticket < 0; });
  return { promoted, inputRank:rank, resultRank, mercenaryCode:selected.code, quantity:1,
    pool:choices.map(c => ({code:c.code,weight:c.weight})) };
}

// This core is callable only from the release-gated route or isolated tests.
// The shared account lock is held by the route; DB guards also reject overlapping stale consumption.
export async function runPreparedMercenaryFusion(env, user, body, { randomInt = mercenaryRandomInt } = {}) {
  const materials = normalizeFusionMaterials(body.materials), requestId = body.requestId;
  const DB = env.DB, p = (sql, ...args) => DB.prepare(sql).bind(...args);
  const readMaterials = () => p(`SELECT mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code IN (${materials.map(() => '?').join(',')})`, user.id, ...materials.map(m => m.code)).all();
  const operation = await runJointOperation(env, user, { requestId, kind:KIND, input:{ materials },
    prepare: async () => {
      const [{document, revision}, owned, draw] = await Promise.all([readMercenaryDocument(env), readMaterials(),
        p('SELECT payload_json,revision FROM mercenary_draw_config_v1 WHERE id=1').first()]);
      const pools = mercenaryGradePools(document.mercenaries, catalogCodes);
      const rank = document.mercenaries.find(c => c.code === materials[0].code)?.rank;
      if (!rank || materials.some(m => document.mercenaries.find(c => c.code === m.code)?.rank !== rank))
        throw fail('MERCENARY_FUSION_RANK', '같은 등급의 중복 카드 8장을 선택하세요.');
      const consumed = materials.map(m => {
        const row = owned.results.find(c => c.mercenary_code === m.code), copies = Number(row?.total_copies), duplicates = Number(row?.duplicate_count);
        if (!row || !Number.isSafeInteger(copies) || !Number.isSafeInteger(duplicates) || copies !== duplicates + 1 || duplicates < m.quantity)
          throw fail('MERCENARY_FUSION_DUPLICATES', '중복 카드 수량이 부족합니다. 기본 보유 1장은 사용할 수 없습니다.', 409);
        return { ...m, totalBefore:copies, duplicatesBefore:duplicates };
      });
      if (!draw) throw fail('MERCENARY_FUSION_CONFIG', '용병 추첨 설정을 확인하세요.', 409);
      const rules = validateMercenaryCardRules(JSON.parse(draw.payload_json).cardRules, catalogCodes);
      const result = pickFusionResult({ rank, pools, rules, randomInt });
      const meta = document.mercenaries.find(c => c.code === result.mercenaryCode), art = SEED.catalog.cards.find(c => c.code === result.mercenaryCode);
      return { version:POLICY.version, policy:{...POLICY}, cmsRevision:revision, drawRevision:Number(draw.revision),
        consumed, result:{...result,name:meta.name,title:meta.title,sourceArt:art.sourceArt}, createdAt:new Date().toISOString() };
    },
    statements: async plan => {
      const current = await readMaterials();
      for (const m of plan.consumed) {
        const row = current.results.find(c => c.mercenary_code === m.code);
        if (!row || Number(row.total_copies) !== m.totalBefore || Number(row.duplicate_count) !== m.duplicatesBefore)
          throw Object.assign(fail('MERCENARY_FUSION_INVENTORY_CHANGED', '보유 수량이 변경되었습니다. 최신 목록에서 다시 선택하세요.', 409), {terminal:true});
      }
      const token = crypto.randomUUID(), list = [];
      const condition = plan.consumed.map(() => 'EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?)').join(' AND ');
      list.push(jointGuard(DB, token, condition+' AND NOT EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?)', [...plan.consumed.flatMap(m => [user.id,m.code,m.totalBefore,m.duplicatesBefore]),requestId+':fusion']));
      for (const m of plan.consumed) {
        list.push(p('UPDATE user_mercenary_cards_v1 SET total_copies=total_copies-?,duplicate_count=duplicate_count-? WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?',m.quantity,m.quantity,user.id,m.code,m.totalBefore,m.duplicatesBefore));
        list.push(p('UPDATE joint_atomic_guards_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND total_copies=? AND duplicate_count=?) THEN 1 ELSE 0 END WHERE token=?',user.id,m.code,m.totalBefore-m.quantity,m.duplicatesBefore-m.quantity,token));
      }
      list.push(...mercenaryCardAcquisitionStatements(DB,{userId:Number(user.id),mercenaryCode:plan.result.mercenaryCode,acquisitionId:requestId+':fusion',createdAt:plan.createdAt}),jointGuardEnd(DB,token));
      return list;
    },
  });
  // The committed operation already has the persisted plan. Avoid another
  // sequential DB round trip on every synthesis and retry.
  return completedFusionReceipt(env, user, operation, operation.replayed);
}
export async function fusionReceipt(env, user, requestId, replayed = true) {
  const operation = await readJointOperation(env, user.id, requestId, KIND);
  if (operation.status !== 'COMPLETED') return {requestId,status:operation.status};
  return completedFusionReceipt(env, user, {...operation,requestId}, replayed);
}
async function completedFusionReceipt(env, user, operation, replayed) {
  const {requestId}=operation;
  const acquired = await env.DB.prepare('SELECT is_duplicate,total_copies_after,duplicate_count_after FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=? AND user_id=? AND mercenary_code=?').bind(requestId+':fusion',user.id,operation.plan.result.mercenaryCode).first();
  if (!acquired) throw fail('MERCENARY_FUSION_RECEIPT', '지급 기록을 확인하고 있습니다.', 503);
  return {requestId,status:'COMPLETED',replayed,policy:operation.plan.policy,consumed:operation.plan.consumed,
    result:{...operation.plan.result,isDuplicate:Boolean(acquired.is_duplicate),totalCopiesAfter:Number(acquired.total_copies_after),duplicatesAfter:Number(acquired.duplicate_count_after)}};
}
export async function handleMercenaryFusion({path,request,env,deps}) {
  if (!['mercenaries/v3/fusion','mercenaries/v3/fusion/feature','mercenaries/v3/fusion/receipt'].includes(path)) return null;
  const {json,authenticate,withUserMutationLock} = deps;
  try {
    if (path.endsWith('/feature')) {
      if (request.method !== 'GET') throw fail('MERCENARY_FUSION_METHOD','GET 요청이 필요합니다.',405);
      return json({enabled:MERCENARY_FUSION_RELEASE_ENABLED,policy:POLICY},200,{'cache-control':'no-store'});
    }
    if (path.endsWith('/receipt')) {
      if (request.method !== 'GET') throw fail('MERCENARY_FUSION_METHOD','GET 요청이 필요합니다.',405);
      const user = await authenticate(request,env); if (!user) throw fail('MERCENARY_FUSION_AUTH','로그인이 필요합니다.',401);
      return json(await fusionReceipt(env,user,new URL(request.url).searchParams.get('requestId')),200,{'cache-control':'no-store'});
    }
    if (request.method !== 'POST') throw fail('MERCENARY_FUSION_METHOD','POST 요청이 필요합니다.',405);
    if (!MERCENARY_FUSION_RELEASE_ENABLED) throw fail('MERCENARY_FUSION_PREPARATION','용병 합성은 현재 연출 검수 중입니다. 카드가 소모되지 않았습니다.',423);
    const user = await authenticate(request,env); if (!user) throw fail('MERCENARY_FUSION_AUTH','로그인이 필요합니다.',401);
    const body = await readJointBody(request,{fields:['requestId','materials']});
    if (typeof withUserMutationLock !== 'function') throw fail('MERCENARY_FUSION_LOCK','계정 잠금 서비스를 확인하세요.',503);
    return json(await withUserMutationLock(env,user.id,path,()=>runPreparedMercenaryFusion(env,user,body)),200,{'cache-control':'no-store'});
  } catch (error) { return jointResponseError(error,json); }
}
