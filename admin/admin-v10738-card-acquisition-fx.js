/* v1073.10 LIMITED/FUR grade acquisition cutscene settings */
(() => {
  const GRADES = ['LIMITED', 'FUR'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function gradeBlock(grade) {
    const label = grade === 'LIMITED' ? 'LIMITED 등급' : 'FUR 등급';
    return `
      <section class="acqFxGradeBlock grade-${grade.toLowerCase()}" data-acq-grade="${grade}">
        <header>
          <div><small>GRADE CUTSCENE</small><h3>${label} 공통 획득 연출</h3><p>${label} 카드 획득 시 카드 종류와 관계없이 아래 영상이 재생됩니다.</p></div>
          <label class="acqFxSwitch"><input type="checkbox" data-field="enabled"><span>공통 연출 사용</span></label>
        </header>
        <div class="acqFxGrid">
          <label class="acqFxWide"><span>영상 경로 (MP4 / WebM)</span><input data-field="mediaUrl" placeholder="/assets/card-acquisition/${grade.toLowerCase()}.mp4"></label>
          <label class="acqFxWide"><span>음향 경로 (선택)</span><input data-field="audioUrl" placeholder="/assets/card-acquisition/${grade.toLowerCase()}.mp3"></label>
          <label><span>최대 재생 시간</span><select data-field="durationMs"><option value="5000">5초</option><option value="8000">8초</option><option value="10000">10초</option><option value="15000">15초</option><option value="20000">20초</option><option value="30000">30초</option></select></label>
          <label class="acqFxSwitch"><input type="checkbox" data-field="skipAllowed" checked><span>건너뛰기 허용</span></label>
        </div>
        <div class="acqFxActions"><button type="button" class="ghost" data-action="preview">영상 미리보기</button><button type="button" data-action="save">${label} 연출 저장</button></div>
        <div class="acqFxCurrent" data-status>설정을 불러오는 중...</div>
      </section>`;
  }

  function ensurePanel() {
    const view = document.querySelector('#view-cards');
    if (!view || document.querySelector('#cardAcquisitionFxMain')) return;
    const anchor = view.querySelector('.cardManageTabs') || view.querySelector('.cardAdvancedSettings') || view.firstElementChild;
    const panel = document.createElement('details');
    panel.id = 'cardAcquisitionFxMain';
    panel.className = 'cardAcquisitionFxMain panel';
    panel.innerHTML = `
      <summary>
        <span><b>LIMITED · FUR 획득 연출 관리</b><small>등급별 공통 영상 2개만 관리합니다.</small></span>
        <em data-fx-summary>펼치기</em>
      </summary>
      <div class="cardAcquisitionFxMainBody">
        <div class="acqFxIntro"><div><small>ACQUISITION CUTSCENE</small><h3>등급 공통 획득 컷신</h3><p>카드별 선택 없이 LIMITED와 FUR 등급 전체에 각각 하나의 공통 영상을 적용합니다. PC·모바일 해상도에 자동 대응합니다.</p></div><span id="acqFxSaveState">설정 준비</span></div>
        <div class="acqFxGradeList">${GRADES.map(gradeBlock).join('')}</div>
      </div>`;
    if (anchor?.nextSibling) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    else view.appendChild(panel);

    panel.addEventListener('toggle', () => {
      const indicator = panel.querySelector('[data-fx-summary]');
      if (indicator) indicator.textContent = panel.open ? '접기' : '펼치기';
      if (panel.open) loadSettings();
    });
    panel.querySelectorAll('[data-action="preview"]').forEach(button => button.addEventListener('click', () => preview(button.closest('[data-acq-grade]'))));
    panel.querySelectorAll('[data-action="save"]').forEach(button => button.addEventListener('click', () => save(button.closest('[data-acq-grade]'))));
  }

  function readBlock(block) {
    return {
      grade: block.dataset.acqGrade,
      enabled: block.querySelector('[data-field="enabled"]').checked,
      mediaUrl: block.querySelector('[data-field="mediaUrl"]').value.trim(),
      audioUrl: block.querySelector('[data-field="audioUrl"]').value.trim(),
      durationMs: Number(block.querySelector('[data-field="durationMs"]').value || 8000),
      skipAllowed: block.querySelector('[data-field="skipAllowed"]').checked
    };
  }

  function applyBlock(block, config = {}) {
    block.querySelector('[data-field="enabled"]').checked = Boolean(Number(config.enabled));
    block.querySelector('[data-field="mediaUrl"]').value = config.mediaUrl || '';
    block.querySelector('[data-field="audioUrl"]').value = config.audioUrl || '';
    const duration = String(Number(config.durationMs || 8000));
    const select = block.querySelector('[data-field="durationMs"]');
    select.value = [...select.options].some(option => option.value === duration) ? duration : '8000';
    block.querySelector('[data-field="skipAllowed"]').checked = Number(config.skipAllowed) !== 0;
    const status = block.querySelector('[data-status]');
    status.innerHTML = Number(config.enabled)
      ? `<b>${esc(block.dataset.acqGrade)} 공통 연출 사용 중</b><small>${esc(config.mediaUrl || '영상 경로 없음')}</small>`
      : `<b>${esc(block.dataset.acqGrade)} 공통 연출 미사용</b><small>기존 기본 획득 연출이 표시됩니다.</small>`;
  }

  async function loadSettings() {
    const panel = document.querySelector('#cardAcquisitionFxMain');
    if (!panel) return;
    const state = panel.querySelector('#acqFxSaveState');
    if (state) state.textContent = '설정 불러오는 중';
    try {
      const data = await api('admin/card-acquisition-effects');
      const configs = data.settings || {};
      GRADES.forEach(grade => {
        const block = panel.querySelector(`[data-acq-grade="${grade}"]`);
        if (block) applyBlock(block, configs[grade] || {});
      });
      if (state) state.textContent = 'LIMITED / FUR 분리 설정';
    } catch (error) {
      if (state) state.textContent = '불러오기 실패';
      panel.querySelectorAll('[data-status]').forEach(box => box.textContent = error.message || '설정을 불러오지 못했습니다.');
    }
  }

  async function save(block) {
    const payload = readBlock(block);
    if (payload.enabled && !payload.mediaUrl) return alert(`${payload.grade} 영상 경로를 입력하세요.`);
    const button = block.querySelector('[data-action="save"]');
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = '저장 중...';
    try {
      const data = await api('admin/card-acquisition-effects', {method: 'PATCH', body: JSON.stringify(payload)});
      applyBlock(block, data.setting || payload);
      const state = document.querySelector('#acqFxSaveState');
      if (state) state.textContent = `${payload.grade} 저장 완료`;
      alert(`${payload.grade} 등급 공통 획득 연출이 저장되었습니다.`);
    } catch (error) {
      alert(error.message || '획득 연출 저장에 실패했습니다.');
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function preview(block) {
    const {grade, mediaUrl, audioUrl} = readBlock(block);
    if (!mediaUrl) return alert(`${grade} 영상 경로를 입력하세요.`);
    const layer = document.createElement('div');
    layer.className = `acqFxPreviewLayer acquisition-cutscene-${grade.toLowerCase()}`;
    layer.innerHTML = `<div class="acqFxPreviewStage"><video playsinline autoplay controls src="${esc(mediaUrl)}"></video>${audioUrl ? `<audio autoplay src="${esc(audioUrl)}"></audio>` : ''}<div class="acqFxPreviewBadge"><small>SPECIAL ACQUISITION</small><strong>${grade}</strong></div></div><button type="button">닫기</button>`;
    document.body.appendChild(layer);
    const close = () => layer.remove();
    layer.querySelector('button').onclick = close;
    layer.onclick = event => { if (event.target === layer) close(); };
  }

  function install() { ensurePanel(); }
  new MutationObserver(install).observe(document.documentElement, {childList: true, subtree: true});
  document.addEventListener('DOMContentLoaded', install);
  setTimeout(install, 0);
})();
