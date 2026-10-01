import {retiredContentResponse} from './_retired_content.js';
// Tax collection and budget submission/approval were retired on 2026-10-01.
// Preserve only existing prediction commitments and their refund audit trail.
const ACCOUNT_TABLE='administration_treasury_v2030';
const LEDGER_TABLE='administration_treasury_ledger_v2030';
export const TREASURY_PREDICTION_SUBSIDY_TABLE='administration_prediction_subsidies_v2030';
const integer=value=>{const number=Number(value);return Number.isSafeInteger(number)?number:NaN};

export async function activePredictionSubsidy(env,eventId){
  const row=await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) amount FROM ${TREASURY_PREDICTION_SUBSIDY_TABLE} WHERE event_id=? AND status='ACTIVE'`).bind(eventId).first();
  return Math.max(0,Number(row?.amount||0));
}

export function predictionSubsidyFinalizationStatements(env,{eventId,voided,amount}){
  const value=Math.max(0,integer(amount)||0);if(value<1)return [];
  if(!voided)return [env.DB.prepare(`UPDATE ${TREASURY_PREDICTION_SUBSIDY_TABLE} SET status='CONSUMED',updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND status='ACTIVE'`).bind(eventId)];
  const referenceKey=`PREDICTION_REFUND:${eventId}`;
  return [
    env.DB.prepare(`UPDATE ${ACCOUNT_TABLE} SET balance=balance+?,total_refunded=total_refunded+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND EXISTS(SELECT 1 FROM ${TREASURY_PREDICTION_SUBSIDY_TABLE} WHERE event_id=? AND status='ACTIVE')`).bind(value,value,eventId),
    env.DB.prepare(`INSERT OR IGNORE INTO ${LEDGER_TABLE}(reference_key,entry_type,amount,balance_after,source_type,source_request_id,memo) SELECT ?,'PREDICTION_REFUND',?,balance,'PREDICTION_SUBSIDY',?,'무효 승부예측 지원금 환입' FROM ${ACCOUNT_TABLE} WHERE id=1 AND EXISTS(SELECT 1 FROM ${TREASURY_PREDICTION_SUBSIDY_TABLE} WHERE event_id=? AND status='ACTIVE')`).bind(referenceKey,value,String(eventId),eventId),
    env.DB.prepare(`UPDATE ${TREASURY_PREDICTION_SUBSIDY_TABLE} SET status='REFUNDED',updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND status='ACTIVE' AND EXISTS(SELECT 1 FROM ${LEDGER_TABLE} WHERE reference_key=?)`).bind(eventId,referenceKey)
  ];
}

export async function handleAdministrationTreasury({path,deps}){
  return retiredContentResponse(path,deps.json);
}
