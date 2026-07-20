const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const detailEl = $('detail');
const connectBtn = $('connect');
const wagoBtn = $('wago');
const logoutBtn = $('logout');

const send = (message) => new Promise((resolve) => {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      resolve({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    resolve(response || { ok: false, error: '확장프로그램 응답이 없습니다.' });
  });
});

function renderError(message) {
  statusEl.textContent = '관리자 인증 확인 실패';
  statusEl.className = 'no';
  detailEl.textContent = message || '인증 상태를 확인하지 못했습니다.';
}

async function refresh() {
  statusEl.textContent = '확인 중...';
  statusEl.className = '';
  detailEl.textContent = 'CMS 로그인 세션을 확인하고 있습니다.';

  try {
    const sync = await send({ type: 'CNINE_SYNC_AUTH' });
    if (!sync.ok) {
      renderError(sync.error);
      return;
    }

    const state = await send({ type: 'CNINE_STATUS' });
    if (!state.ok) {
      renderError(state.error);
      return;
    }

    if (state.connected) {
      statusEl.textContent = '관리자 인증 연결됨';
      statusEl.className = 'ok';
      detailEl.textContent = `저장 시각: ${state.adminTokenSavedAt || '-'}\n와고 닉네임 클릭 시 지급창이 열립니다.`;
    } else {
      statusEl.textContent = '관리자 인증 필요';
      statusEl.className = 'no';
      detailEl.textContent = 'CMS에 OWNER/ADMIN 계정으로 로그인한 뒤 아래 버튼을 눌러 인증을 가져오세요.';
    }
  } catch (error) {
    renderError(error?.message);
  }
}

connectBtn.addEventListener('click', async () => {
  const sync = await send({ type: 'CNINE_SYNC_AUTH' });
  if (sync.ok && sync.connected) {
    await refresh();
    return;
  }
  await chrome.tabs.create({ url: 'https://cnine-card.pages.dev/admin/' });
  detailEl.textContent = 'CMS가 열렸습니다. 로그인 상태를 확인한 뒤 팝업을 다시 열어주세요.';
});

wagoBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes('ygosu.com')) window.close();
  else await chrome.tabs.create({ url: 'https://ygosu.com/board/soop' });
});

logoutBtn.addEventListener('click', async () => {
  await send({ type: 'CNINE_LOGOUT' });
  await refresh();
});

refresh();
