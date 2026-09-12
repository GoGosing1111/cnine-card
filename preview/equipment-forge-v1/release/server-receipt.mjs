// Proposed live boundary. The host supplies its authenticated request function.
// This module is not imported by the approved preview or by production routes.
const token = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
const id = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value);
const require = (condition, message) => { if (!condition) throw new Error(message); };
const copy = value => structuredClone(value);
const imagePath = value => typeof value === 'string' && /^\/?assets\/[A-Za-z0-9_./-]+$/.test(value) &&
  !value.split('/').includes('..') && !value.includes('//');

export function createCommand(input, createId = () => crypto.randomUUID()) {
  require(input?.kind === 'enhance' || input?.kind === 'restore', '강화 또는 복구 요청이어야 합니다.');
  const allowed = ['kind', 'instanceId', 'quoteId', 'policyRevision', 'expectedInstanceVersion',
    ...(input.kind === 'enhance' ? ['useProtection'] : ['recordId'])];
  require(Object.keys(input).every(key => allowed.includes(key)), '클라이언트 확률·비용·추첨 값은 전송할 수 없습니다.');
  require(id(input.instanceId) && token(input.quoteId) && token(input.policyRevision), '개별 장비 ID·서버 견적·정책 버전이 필요합니다.');
  require(Number.isSafeInteger(input.expectedInstanceVersion) && input.expectedInstanceVersion >= 0, '장비 상태 버전이 필요합니다.');
  if (input.kind === 'enhance') require(typeof input.useProtection === 'boolean', '보호권 사용 여부를 명시해야 합니다.');
  else require(token(input.recordId), '복구할 파괴 기록 ID가 필요합니다.');
  const requestId = createId(); require(token(requestId), '올바른 요청 ID가 필요합니다.');
  return Object.freeze({ ...copy(input), requestId });
}

function equipment(value) {
  require(value && id(value.instanceId) && id(value.equipmentId), '개별 장비 식별자가 없는 결과입니다.');
  require(Number.isSafeInteger(value.level) && value.level >= 0 && ['owned', 'destroyed'].includes(value.status), '장비 상태가 올바르지 않습니다.');
  require(typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 200 && imagePath(value.image), '장비 표시 정보가 올바르지 않습니다.');
  require(typeof value.grade === 'string' && /^[A-Z_]{1,30}$/.test(value.grade), '장비 등급이 올바르지 않습니다.');
  return { id: value.instanceId, instanceId: value.instanceId, equipmentId: value.equipmentId,
    level: value.level, status: value.status, name: value.name, image: value.image.startsWith('/') ? value.image : '/' + value.image,
    grade: value.grade, collection: String(value.collection || ''), kindLabel: String(value.kindLabel || '') };
}

export function visualReceipt(receipt, command, accountId) {
  require(receipt?.schemaVersion === 1 && receipt.authority === 'SERVER' && receipt.status === 'COMPLETED', '완료된 서버 결과가 필요합니다.');
  require(id(accountId) && receipt.accountId === accountId && receipt.requestId === command.requestId &&
    receipt.kind === command.kind && receipt.policyRevision === command.policyRevision, '계정·요청·정책이 일치하지 않는 결과입니다.');
  const before = equipment(receipt.before), after = equipment(receipt.after);
  require(before.id === command.instanceId && before.id === after.id && before.equipmentId === after.equipmentId, '같은 장비 인스턴스의 결과가 아닙니다.');
  require(typeof receipt.protectionApplied === 'boolean', '보호 발동 상태가 필요합니다.');
  let visual;
  if (command.kind === 'restore') {
    require(receipt.outcome === 'restore' && !receipt.protectionApplied && receipt.recordId === command.recordId &&
      before.status === 'destroyed' && after.status === 'owned', '복구 기록과 장비 상태가 일치하지 않습니다.');
    // The restored level comes from the server policy; it is never assumed to be the old level.
    visual = 'restore';
  } else {
    require(before.status === 'owned' && ['success', 'maintain', 'destroy'].includes(receipt.outcome), '성공·유지·파괴 중 하나여야 합니다.');
    const protectedDestruction = receipt.outcome === 'destroy' && receipt.protectionApplied;
    require(!receipt.protectionApplied || (protectedDestruction && command.useProtection), '보호권을 요청하지 않은 결과에 보호를 적용할 수 없습니다.');
    require(after.level === before.level + (receipt.outcome === 'success' ? 1 : 0), '판정과 강화 단계가 일치하지 않습니다.');
    require(after.status === (receipt.outcome === 'destroy' && !protectedDestruction ? 'destroyed' : 'owned'), '판정과 장비 보유 상태가 일치하지 않습니다.');
    if (after.status === 'destroyed') require(token(receipt.recordId), '파괴 기록이 없는 파괴 결과입니다.');
    else require(receipt.recordId == null, '파괴되지 않은 장비에 파괴 기록을 만들 수 없습니다.');
    visual = protectedDestruction ? 'protected' : receipt.outcome;
  }
  return { kind: command.kind, requestId: command.requestId, before, after, outcome: receipt.outcome,
    visual, recordId: receipt.recordId || null, policyRevision: receipt.policyRevision };
}

export class ForgeCommandSession {
  #request; #accountId; #pending = null; #flight = null;
  constructor({ request, accountId }) {
    require(typeof request === 'function' && id(accountId), '인증 요청 함수와 계정 ID가 필요합니다.');
    this.#request = request; this.#accountId = accountId;
  }
  get pending() { return this.#pending ? copy(this.#pending) : null; }
  send(command) {
    require(command && token(command.requestId), '준비된 요청이 필요합니다.');
    const { requestId, ...input } = command;
    const validated = createCommand(input, () => requestId);
    require(!this.#pending || JSON.stringify(this.#pending) === JSON.stringify(validated), '이전 요청의 처리 결과부터 확인해야 합니다.');
    if (this.#flight) return this.#flight;
    this.#pending = validated;
    return this.#run({ path: `character/equipment/forge/${validated.kind}`, method: 'POST', body: copy(validated) });
  }
  recover() {
    require(this.#pending, '조회할 요청이 없습니다.');
    if (this.#flight) return this.#flight;
    return this.#run({ path: `character/equipment/forge/receipt?requestId=${encodeURIComponent(this.#pending.requestId)}`, method: 'GET' });
  }
  #run(request) {
    const command = this.#pending;
    this.#flight = Promise.resolve().then(() => this.#request(request)).then(response => {
      if (response?.status === 'NOT_COMMITTED') {
        require(response.authority === 'SERVER' && response.accountId === this.#accountId &&
          response.requestId === command.requestId, '요청 미처리 확인의 계정·ID가 일치하지 않습니다.');
        this.#pending = null;
        return { committed: false, message: String(response.message || '처리되지 않은 요청입니다.') };
      }
      const visual = visualReceipt(response, command, this.#accountId);
      this.#pending = null;
      return { committed: true, receipt: copy(response), visual };
    }).finally(() => { this.#flight = null; });
    return this.#flight;
  }
}
