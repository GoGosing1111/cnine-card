const ENDPOINT = 'admin/clan-war/member-assignment';
const CONFIRMATION = 'ASSIGN_UNAFFILIATED_CLAN_MEMBER';
const KEYS = ['userId', 'nickname', 'clanId', 'clanName', 'seasonId'];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const positiveId = value => Number.isSafeInteger(value) && value > 0;

export function resolveAssignmentTarget(users, state, nickname, clanId) {
  const accounts = (users?.users || []).filter(user => user.nickname === nickname);
  const clans = (state?.clans || []).filter(clan => clan.id === clanId && clan.active);
  assert(accounts.length === 1, '닉네임이 정확히 일치하는 계정 1개를 찾지 못했습니다.');
  assert(clans.length === 1, '선택한 활성 클랜을 다시 확인하세요.');
  assert(state.season?.phase === 'ACTIVE', '현재 시즌은 편입 가능한 단계가 아닙니다.');
  assert(String(accounts[0].status).toUpperCase() === 'ACTIVE', '활성 계정만 편입할 수 있습니다.');
  const target = {userId:Number(accounts[0].id), nickname:accounts[0].nickname,
    clanId:clans[0].id, clanName:clans[0].name, seasonId:state.season.id};
  assert(['userId', 'clanId', 'seasonId'].every(key => positiveId(target[key])), '계정·클랜·시즌 ID를 확인하지 못했습니다.');
  return target;
}

export function validateAssignmentPreview(preview, target) {
  assert(preview?.ok && KEYS.every(key => preview[key] === target[key]), '서버 확인 결과의 대상이 일치하지 않습니다.');
  assert(typeof preview.previewId === 'string' && preview.previewId.length > 10 && preview.confirmation === CONFIRMATION,
    '무소속 편입 확인 번호가 올바르지 않습니다.');
  assert(preview.verified === true && preview.rankedDeckReady === true && !preview.currentMembership && !preview.gift
    && Array.isArray(preview.removals) && preview.removals.length === 0, '무소속·인증·덱 검증 결과를 확인하세요.');
  assert(Number.isInteger(preview.memberCount) && preview.memberCount >= 0
    && preview.afterCount === preview.memberCount + 1 && preview.afterCount <= preview.maxMembers && preview.maxMembers <= 22,
    '편입 후 클랜 정원을 확인하세요.');
  return preview;
}

// A lost HTTP response must reuse the same server receipt, never create another admission.
export class AdmissionSession {
  constructor(request, save, restored = null) {
    this.request = request; this.save = save; this.receipt = restored; this.busy = false;
    if (restored) validateAssignmentPreview(restored.preview, restored.preview);
  }
  async preview(target) {
    assert(!this.busy && !this.receipt?.started, '처리 중인 편입 결과를 먼저 다시 확인하세요.');
    this.busy = true;
    this.receipt = null;
    try {
      this.save(null);
      const preview = validateAssignmentPreview(await this.request(ENDPOINT, {action:'preview', ...target}), target);
      const receipt = {preview, started:false, result:null};
      this.save(receipt); this.receipt = receipt;
      return preview;
    } finally { this.busy = false; }
  }
  async apply() {
    assert(!this.busy && this.receipt, '편입 대상을 먼저 확인하세요.');
    if (this.receipt.result) return this.receipt.result;
    this.busy = true;
    try {
      const receipt = {...this.receipt, started:true};
      this.save(receipt); this.receipt = receipt;
      const preview = receipt.preview;
      const result = await this.request(ENDPOINT, {action:'apply', previewId:preview.previewId, confirmation:CONFIRMATION});
      assert(result?.ok && result.previewId === preview.previewId && KEYS.every(key => result[key] === preview[key])
        && result.memberRole === 'MEMBER' && result.removedCount === 0 && !result.gift && result.completedAt,
        '완료 응답을 확인하지 못했습니다. 같은 요청 번호로 결과를 다시 확인하세요.');
      this.receipt = {...receipt, result}; this.save(this.receipt);
      return result;
    } finally { this.busy = false; }
  }
}

async function boot() {
  const byId = id => document.getElementById(id);
  const status = (message, error = false) => { byId('status').textContent = message; byId('status').dataset.error = String(error); };
  try {
    const token = localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token');
    assert(token, 'CMS에서 먼저 OWNER 계정으로 로그인하세요.');
    const request = async (path, body) => {
      const response = await fetch('../api/' + path, {method:body ? 'POST' : 'GET', cache:'no-store',
        headers:{'content-type':'application/json', authorization:'Bearer ' + token},
        ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(30000)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `서버 요청 실패 (${response.status})`);
      return data;
    };
    const admin = await request('admin/dashboard');
    assert(admin.role === 'OWNER' && positiveId(Number(admin.admin?.id)), 'OWNER 계정만 사용할 수 있습니다.');
    byId('owner').textContent = `인증: ${admin.admin.nickname} · OWNER`;
    const state = await request('admin/clan-war/settings');
    assert(state.season?.phase === 'ACTIVE', '현재 시즌은 편입 가능한 단계가 아닙니다.');
    for (const clan of state.clans.filter(clan => clan.active)) {
      const option = document.createElement('option'); option.value = String(clan.id);
      option.textContent = `${clan.name} · ${clan.memberCount}/${state.season.maxMembers}명`;
      byId('clan').append(option);
    }
    const storageKey = `cnine_owner_clan_admission:${admin.admin.id}`;
    const restored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    const session = new AdmissionSession(request, receipt => {
      if (receipt) localStorage.setItem(storageKey, JSON.stringify(receipt));
      else localStorage.removeItem(storageKey);
    }, restored?.started ? restored : null);
    const render = () => {
      const receipt = session.receipt, preview = receipt?.preview, result = receipt?.result;
      byId('fields').disabled = session.busy || Boolean(receipt?.started);
      byId('apply').hidden = !preview || Boolean(result);
      byId('apply').disabled = session.busy || !preview || Boolean(result);
      byId('apply').textContent = receipt?.started ? '같은 요청 번호로 결과 재확인' : '확인한 계정 편입';
      byId('details').hidden = !preview;
      if (preview) {
        byId('details').textContent = `${result ? '편입 완료' : '서버 검증 완료'}\n계정: ${preview.nickname} (ID ${preview.userId})\n클랜: ${preview.clanName} (ID ${preview.clanId})\n시즌: ${preview.seasonNo} (ID ${preview.seasonId})\n정원: ${preview.memberCount}명 → ${result ? result.memberCount : preview.afterCount}/${preview.maxMembers}명\n2차 인증·랭크전 덱: 확인\n기존 멤버 탈퇴·보상 지급: 없음\n요청 번호: ${preview.previewId}${result ? '\n완료 시각: ' + result.completedAt : ''}`;
      }
    };
    byId('assignment-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (session.busy || session.receipt?.started) return;
      byId('fields').disabled = true; byId('apply').disabled = true;
      status('계정과 클랜을 조회하고 서버에서 편입 조건을 검증하고 있습니다.');
      try {
        const nickname = byId('nickname').value.trim(), clanId = Number(byId('clan').value);
        const [users, fresh] = await Promise.all([request('admin/users?q=' + encodeURIComponent(nickname)), request('admin/clan-war/settings')]);
        await session.preview(resolveAssignmentTarget(users, fresh, nickname, clanId));
        status('확인된 계정과 클랜을 확인한 뒤 편입 버튼을 누르세요.');
      } catch (error) { session.receipt = null; status(error.message, true); }
      finally { render(); }
    });
    byId('apply').addEventListener('click', async () => {
      if (session.busy || !session.receipt) return;
      const preview = session.receipt.preview;
      if (!session.receipt.started && !window.confirm(`${preview.nickname} (ID ${preview.userId}) 계정을 ${preview.clanName} 클랜에 편입합니다.\n기존 멤버 탈퇴나 보상 지급은 없습니다. 진행할까요?`)) return;
      const pending = session.apply(); render(); status('서버에서 편입 결과를 확인하고 있습니다.');
      try { const result = await pending; status(`${result.nickname} → ${result.clanName} 편입 완료 · ${result.memberCount}/${result.maxMembers}명`); }
      catch (error) { status(`${error.message} 같은 요청 번호로 다시 확인할 수 있습니다.`, true); }
      finally { render(); }
    });
    render();
    status(session.receipt?.result ? '이전 편입 완료 기록입니다.' : session.receipt?.started
      ? '미확인 편입 요청이 있습니다. 같은 요청 번호로 결과를 확인하세요.' : '계정 닉네임과 편입할 클랜을 선택하세요.');
  } catch (error) { status(error.message, true); }
}

if (typeof document !== 'undefined') boot();
