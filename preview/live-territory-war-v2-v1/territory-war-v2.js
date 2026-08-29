(() => {
  const root = document.getElementById('territoryWarPreview');
  const drawerLayer = root.querySelector('.tw4-drawer-layer');
  const drawer = drawerLayer.querySelector('.tw4-drawer');
  const drawerTitle = drawer.querySelector('#drawerTitle');
  const drawerContent = drawer.querySelector('.tw4-drawer-content');
  const toast = root.querySelector('.tw4-toast');
  let toastTimer = 0;

  const zones = [
    { number: '01', name: '청람 본성', state: '청람 점령', stateClass: 'side-a', code: 'AZURE CITADEL', coordinate: 'N 37° 31′ / E 126° 46′', description: '청람 연합의 최종 방어 거점. 본성이 함락되면 해당 회차의 공성전이 즉시 종료됩니다.' },
    { number: '02', name: '서부 참호선', state: '청람 점령', stateClass: 'side-a', code: 'WESTERN TRENCH', coordinate: 'N 37° 32′ / E 126° 49′', description: '다층 참호와 장갑 방벽으로 구성된 서부 방어선. 방어 작전의 효율이 높은 지역입니다.' },
    { number: '03', name: '철교 보급로', state: '청람 점령', stateClass: 'side-a', code: 'IRON SUPPLY LINE', coordinate: 'N 37° 36′ / E 126° 52′', description: '강을 가로지르는 철교와 보급 창고가 집중된 지역. 점령 진영의 작전 게이지 수급을 지원합니다.' },
    { number: '04', name: '폐허 외곽', state: '청람 점령', stateClass: 'side-a', code: 'RUINED OUTSKIRTS', coordinate: 'N 37° 33′ / E 126° 55′', description: '중앙 시가지를 감싸는 폐허 지대. 현재 전선과 인접해 다음 교전의 주요 진입로가 됩니다.' },
    { number: '05', name: '중앙 지휘 구역', state: '교전 중', stateClass: 'contested', code: 'COMMAND NEXUS', coordinate: 'N 37° 34′ / E 126° 58′', description: '양 진영의 주요 보급로가 교차하는 핵심 지휘 구역. 이곳을 점령하면 다음 전선이 동쪽으로 이동합니다.' },
    { number: '06', name: '동부 교량', state: '진홍 점령', stateClass: 'side-b', code: 'EASTERN BRIDGE', coordinate: 'N 37° 31′ / E 127° 01′', description: '진홍 군단이 확보한 교량 거점. 중앙 방어선과 붉은 포대를 연결하는 핵심 통로입니다.' },
    { number: '07', name: '붉은 포대', state: '진홍 점령', stateClass: 'side-b', code: 'CRIMSON BATTERY', coordinate: 'N 37° 38′ / E 127° 04′', description: '장거리 자주포가 배치된 고지대. 포격 및 대포병 반격 작전의 중심 구역입니다.' },
    { number: '08', name: '산악 관문', state: '진홍 점령', stateClass: 'side-b', code: 'MOUNTAIN GATE', coordinate: 'N 37° 34′ / E 127° 07′', description: '협곡과 성벽이 맞물린 진홍 군단의 방어 관문. 정면 돌파 시 강한 저항이 예상됩니다.' },
    { number: '09', name: '진홍 본성', state: '진홍 점령', stateClass: 'side-b', code: 'CRIMSON FORTRESS', coordinate: 'N 37° 39′ / E 127° 11′', description: '진홍 군단의 최종 방어 거점. 본성이 함락되면 청람 연합의 회차 승리가 확정됩니다.' }
  ];

  const templates = {
    operations: ['전술 작전', 'operationsTemplate'],
    ranking: ['공성 기여도 · 지휘권', 'rankingTemplate'],
    report: ['최근 교전 전황', 'reportTemplate'],
    loadout: ['내 전투단', 'loadoutTemplate'],
    command: ['전장 지휘 통신', null]
  };

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
  }

  function openDrawer(type) {
    const config = templates[type] || templates.operations;
    drawerTitle.textContent = config[0];
    drawer.dataset.type = type;
    if (type === 'command') {
      drawerContent.innerHTML = root.querySelector('.tw4-command-rail').innerHTML;
    } else {
      const template = document.getElementById(config[1]);
      drawerContent.replaceChildren(template.content.cloneNode(true));
    }
    drawerLayer.hidden = false;
    requestAnimationFrame(() => drawerLayer.classList.add('open'));
    document.body.classList.add('tw4-drawer-open');
  }

  function closeDrawer() {
    drawerLayer.classList.remove('open');
    document.body.classList.remove('tw4-drawer-open');
    setTimeout(() => { if (!drawerLayer.classList.contains('open')) drawerLayer.hidden = true; }, 240);
  }

  function selectZone(index) {
    const zone = zones[index];
    if (!zone) return;
    root.querySelectorAll('.tw4-node').forEach((node, nodeIndex) => node.classList.toggle('selected', nodeIndex === index));
    root.querySelector('[data-zone-number]').textContent = zone.number;
    root.querySelector('[data-zone-name]').textContent = zone.name;
    const state = root.querySelector('[data-zone-state]');
    state.textContent = zone.state;
    state.className = zone.stateClass;
    root.querySelector('[data-zone-code]').textContent = zone.code;
    root.querySelector('[data-zone-coordinate]').textContent = zone.coordinate;
    root.querySelector('[data-zone-description]').textContent = zone.description;
    if (matchMedia('(max-width: 820px)').matches) {
      drawerTitle.textContent = `${zone.number} · ${zone.name}`;
      drawer.dataset.type = 'zone';
      drawerContent.innerHTML = `<section class="tw4-mobile-zone-detail"><div><small>${zone.code}</small><span class="${zone.stateClass}">${zone.state}</span></div><b>${zone.coordinate}</b><p>${zone.description}</p><button type="button" data-drawer-close>지도에 표시</button></section>`;
      drawerLayer.hidden = false;
      requestAnimationFrame(() => drawerLayer.classList.add('open'));
      document.body.classList.add('tw4-drawer-open');
    }
  }

  root.addEventListener('click', event => {
    const drawerButton = event.target.closest('[data-drawer]');
    if (drawerButton) return openDrawer(drawerButton.dataset.drawer);
    if (event.target.closest('[data-drawer-close]')) return closeDrawer();
    const node = event.target.closest('[data-node]');
    if (node) return selectZone(Number(node.dataset.node));
    if (event.target.closest('[data-attack]')) return showToast('PROJECT V V3 공성 교전 연결 지점 · 라이브 데이터 계약 유지');
    if (event.target.closest('[data-refresh]')) {
      const button = event.target.closest('[data-refresh]');
      button.classList.add('spinning');
      setTimeout(() => button.classList.remove('spinning'), 650);
      return showToast('전황 동기화 완료 · 추가 DB 조회 없는 프리뷰 상태');
    }
    const toastButton = event.target.closest('[data-toast]');
    if (toastButton) showToast(toastButton.dataset.toast);
    const operation = event.target.closest('.tw4-operation-grid button');
    if (operation) {
      operation.parentElement.querySelectorAll('button').forEach(button => button.classList.toggle('selected', button === operation));
      showToast(`${operation.querySelector('b').textContent} 작전 투표 선택`);
    }
  });

  root.addEventListener('submit', event => {
    if (!event.target.matches('.tw4-command-compose')) return;
    event.preventDefault();
    const input = event.target.querySelector('input');
    if (!input.value.trim()) return input.focus();
    showToast('지휘 메시지 전송 UI 확인 완료');
    input.value = '';
  });

  const dispatchSamples = [
    {side:'a',tier:3,kicker:'COMBAT MOMENTUM',code:'WIN STREAK 3',mark:'3W',title:'청람 연합 교전 3연승',detail:'진홍 군단 방어선에 경계 단계가 발령됐습니다.'},
    {side:'b',tier:5,kicker:'COMBAT MOMENTUM',code:'WIN STREAK 5',mark:'5W',title:'진홍 군단 교전 5연승',detail:'전선 사기가 최고조에 도달했습니다 · 연승 저지 작전이 필요합니다.'},
    {side:'a',tier:0,kicker:'FRONTLINE ADVANCE',code:'FRONT MOVED',mark:'MOVE',title:'청람 연합 동부 교량 확보',detail:'공성선이 동부 교량 방향으로 이동했습니다 · 신규 교전이 시작됩니다.'}
  ];
  let dispatchIndex = 0;
  let dispatchPreviewLayer = null;
  let dispatchPreviewTimer = 0;
  function playDispatchPreview() {
    const item = dispatchSamples[dispatchIndex++ % dispatchSamples.length];
    const layer = dispatchPreviewLayer || document.createElement('div');
    clearTimeout(dispatchPreviewTimer);
    dispatchPreviewLayer = layer;
    layer.className = `tw4-dispatch-layer side-${item.side} tier-${item.tier}`;
    layer.setAttribute('aria-live','polite');
    layer.innerHTML = `<article class="tw4-dispatch-card" role="status"><div class="tw4-dispatch-rail" aria-hidden="true"><i></i><i></i><i></i></div><div class="tw4-dispatch-copy"><small><i></i>${item.kicker}<b>${item.code}</b></small><strong>${item.title}</strong><span>${item.detail}</span></div><em aria-hidden="true">${item.mark}</em><div class="tw4-dispatch-sweep" aria-hidden="true"></div></article>`;
    if (!layer.isConnected) document.body.appendChild(layer);
    document.body.classList.add('territory-war-dispatch-active');
    requestAnimationFrame(() => layer.classList.add('is-live'));
    dispatchPreviewTimer = setTimeout(() => { if (dispatchPreviewLayer !== layer) return; layer.classList.remove('is-live'); layer.classList.add('is-holding'); document.body.classList.remove('territory-war-dispatch-active'); }, 3300);
  }
  setTimeout(playDispatchPreview, 220);
  setInterval(playDispatchPreview, 7200);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) playDispatchPreview(); });

  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !drawerLayer.hidden) closeDrawer(); });
})();
