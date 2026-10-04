export const EQUIPMENT_CRAFT_RATE=10;
export const isEquipmentCraft=recipe=>recipe?.category==='ITEM_SYNTHESIS'&&(recipe.outputType??recipe.output_type)==='EQUIPMENT';
export function equipmentCraftPolicy(raw){
  const policy=raw.equipmentCraft||{},inputEquipmentId=Number(policy.inputEquipmentId),pityAfter=Number(policy.pityAfter);
  if(!Number.isSafeInteger(inputEquipmentId)||inputEquipmentId<1)throw Error('투입할 +10 장비 종류를 선택하세요.');
  if(policy.pityAfter===null||policy.pityAfter===undefined||String(policy.pityAfter).trim()===''||!Number.isSafeInteger(pityAfter)||pityAfter<1||pityAfter>1000000)throw Error('천장 기준 실패 횟수를 1~1,000,000회로 설정하세요.');
  if(Number(raw.successRate??raw.success_rate)!==EQUIPMENT_CRAFT_RATE)throw Error('장비제작의 기본 성공 확률은 10%입니다.');
  if((raw.paymentMode??raw.payment_mode)!=='BOTH'||Number(raw.outputQuantity??raw.output_quantity)!==1)throw Error('장비제작은 코인 + 마스터의 별 결제와 결과 장비 1개를 사용합니다.');
  if(Number(raw.outputRef??raw.output_ref)===inputEquipmentId)throw Error('투입 장비와 결과 장비는 달라야 합니다.');
  const revision=Number(policy.revision??0);
  if(!Number.isSafeInteger(revision)||revision<0)throw Error('장비 조합식 설정 버전이 올바르지 않습니다.');
  // Existing recipes always preserve the input unless the operator opts in.
  const failureInputPolicy=policy.failureInputPolicy===undefined?'PRESERVE':policy.failureInputPolicy;
  if(!['PRESERVE','CONSUME'].includes(failureInputPolicy))throw Error('실패 시 투입 장비 처리 방식을 보존 또는 소모로 선택하세요.');
  return {inputEquipmentId,pityAfter,revision,requiredLevel:10,successRate:10,failureInputPolicy};
}
