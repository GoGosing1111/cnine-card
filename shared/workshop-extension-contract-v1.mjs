// No seed or launch policy: new recipes exist only after an explicit CMS save.
export const WORKSHOP_EXTENSION_CATEGORIES = Object.freeze(['SUIT_CORE_SYNTHESIS', 'ITEM_SYNTHESIS']);

export function validateWorkshopExtension(raw) {
  const category = String(raw.category || '').trim().toUpperCase();
  if (!WORKSHOP_EXTENSION_CATEGORIES.includes(category)) return;
  const output = String(raw.outputType ?? raw.output_type ?? '').toUpperCase();
  const ref = String(raw.outputRef ?? raw.output_ref ?? '').trim().toUpperCase();
  const mode = String(raw.paymentMode ?? raw.payment_mode ?? '').toUpperCase();
  if (output !== 'INVENTORY_ITEM') throw new Error('확장 합성의 결과 종류는 인벤토리 아이템이어야 합니다.');
  const fields = [
    ['성공 확률', raw.successRate ?? raw.success_rate, 0, 100, false],
    ['코인 비용', raw.coinCost ?? raw.coin_cost, 0, Number.MAX_SAFE_INTEGER, true],
    ['마스터의 별 비용', raw.masterStarCost ?? raw.master_star_cost, 0, 1000000, true],
  ];
  for (const [label, value, min, max, integer] of fields) {
    if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max || (integer && !Number.isSafeInteger(Number(value)))) {
      throw new Error(`${label}을 명시적으로 설정하세요. 미정 값을 자동 적용하지 않습니다.`);
    }
  }
  const materials = Array.isArray(raw.materials) ? raw.materials : [];
  if (!materials.length || materials.length > 30) throw new Error('합성 재료를 1~30종 등록하세요.');
  for (const material of materials) {
    const quantity = Number(material.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000000) throw new Error('합성 재료 수량은 1~100,000,000 사이의 정수여야 합니다.');
    if (String(material.itemCode ?? material.item_code).toUpperCase() === 'MASTER_STAR') throw new Error('마스터의 별은 중복 재료가 아닌 전용 비용 항목으로 설정하세요.');
  }
  if (category === 'SUIT_CORE_SYNTHESIS') {
    if (mode !== 'BOTH') throw new Error('슈트코어 합성은 코인 + 마스터의 별 결제 방식을 사용합니다.');
    if (!/^SUIT_CORE_[1-9]\d*$/.test(ref)) throw new Error('결과물로 슈트 코어를 선택하세요.');
    if (!materials.some(item => /^SUIT_CORE_[1-9]\d*$/.test(String(item.itemCode ?? item.item_code).toUpperCase()))) throw new Error('투입할 슈트 코어가 필요합니다.');
    if (materials.some(item => String(item.itemCode ?? item.item_code).toUpperCase() === ref)) throw new Error('투입 코어와 결과 코어는 달라야 합니다.');
  }
}
