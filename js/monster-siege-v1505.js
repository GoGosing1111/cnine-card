(() => {
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
  const fmt = (value) => Number(value || 0).toLocaleString("ko-KR");
  const percent = (value, max) =>
    Math.max(0, Math.min(100, (Number(value || 0) / Math.max(1, Number(max || 1))) * 100));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value || 0)));
  const MAP_FALLBACK = [
    { index: 0, key: "ALLIANCE_BASE", name: "숲켓몬 연합 본진", code: "ALLIANCE HQ", x: 7, y: 60 },
    { index: 1, key: "OUTER", name: "검은 습지 초소", code: "OUTER POST", x: 24, y: 58 },
    { index: 2, key: "GATE", name: "철혈 관문", code: "IRON GATE", x: 40, y: 49 },
    { index: 3, key: "INNER", name: "잿불 시가지", code: "EMBER CITY", x: 56, y: 53 },
    { index: 4, key: "GUARD", name: "월식 왕궁", code: "ROYAL KEEP", x: 72, y: 43 },
    { index: 5, key: "LORD", name: "심연 성채", code: "ECLIPSE CITADEL", x: 91, y: 25 },
  ];
  let overlay = null,
    data = null,
    timer = null,
    busy = false,
    pollBusy = false,
    viewportCleanup = null,
    serverOffset = 0,
    lastServerNow = "",
    lastPollAt = 0,
    lastRenderSignature = "";

  const api = (path, options = {}) =>
    globalThis.apiRequest(path, options, {
      ttl: 0,
      timeoutMs: 20000,
      replaceInflight: true,
    });
  const requestId = () =>
    `SIEGE:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  function serverTimestamp(value) {
    if (value instanceof Date) return value.getTime();
    const rawValue = String(value || "").trim();
    if (!rawValue) return NaN;
    return Date.parse(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(rawValue)
        ? `${rawValue.replace(" ", "T")}Z`
        : rawValue,
    );
  }
  function serverClockNow() {
    return Date.now() + serverOffset;
  }
  function syncServerClock(payload) {
    const stamp = String(payload?.serverNow || "");
    if (!stamp || stamp === lastServerNow) return;
    const parsed = serverTimestamp(stamp);
    if (Number.isFinite(parsed)) serverOffset = parsed - Date.now();
    lastServerNow = stamp;
  }
  function clock(value) {
    const milliseconds = serverTimestamp(value) - serverClockNow();
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "00:00:00";
    const seconds = Math.ceil(milliseconds / 1000);
    return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function rechargeClock(value) {
    const milliseconds = serverTimestamp(value) - serverClockNow();
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "충전 확인 중";
    const seconds = Math.ceil(milliseconds / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function rechargeRule(mine) {
    const seconds = Math.max(60, Number(mine?.rechargeSeconds || 180));
    return seconds % 60 === 0
      ? `${seconds / 60}분마다 공격권 1회 충전`
      : `${seconds}초마다 공격권 1회 충전`;
  }
  function timeLabel(value) {
    const milliseconds = serverClockNow() - serverTimestamp(value);
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return "방금 전";
    if (milliseconds < 60000) return `${Math.max(1, Math.floor(milliseconds / 1000))}초 전`;
    if (milliseconds < 3600000) return `${Math.floor(milliseconds / 60000)}분 전`;
    return new Date(serverTimestamp(value)).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  function renderSignature(payload) {
    return [
      payload?.event?.id || 0,
      payload?.event?.version || 0,
      payload?.campaign?.currentFront?.nodeIndex || 0,
      payload?.ai?.sequence || 0,
      payload?.mine?.energy ?? "-",
      payload?.mine?.attacks ?? "-",
      payload?.reward?.event_id || 0,
    ].join(":");
  }
  function inject() {
    document.querySelectorAll("[data-monster-siege-entry]").forEach((entry) => {
      if (!entry.closest(".pve-mode-tabs")) entry.remove();
    });
    const target = document.querySelector(".pve-mode-tabs");
    if (!target || target.querySelector("[data-monster-siege-entry]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.monsterSiegeEntry = "1";
    button.className = "pve-mode-btn monster-siege-pve-entry";
    button.innerHTML = "<span>몬스터 공성전</span><small>FRONTLINE WAR</small>";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    });
    target.appendChild(button);
  }
  function syncViewport() {
    const apply = () =>
      document.documentElement.style.setProperty(
        "--siege-vv-height",
        `${Math.round(window.visualViewport?.height || window.innerHeight)}px`,
      );
    apply();
    window.visualViewport?.addEventListener("resize", apply, { passive: true });
    window.addEventListener("orientationchange", apply, { passive: true });
    viewportCleanup = () => {
      window.visualViewport?.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      document.documentElement.style.removeProperty("--siege-vv-height");
    };
  }
  function close() {
    clearInterval(timer);
    timer = null;
    viewportCleanup?.();
    viewportCleanup = null;
    document.querySelector(".ms4-operation-briefing")?.remove();
    overlay?.remove();
    overlay = null;
    data = null;
    lastRenderSignature = "";
    document.body.classList.remove("monster-siege-open");
  }
  function campaignState() {
    if (data?.campaign) return data.campaign;
    const phaseIndex = Math.max(0, Math.min(4, Number(data?.event?.phaseIndex || 0)));
    const frontNodeIndex = phaseIndex + 1;
    const phase = data?.phase || {};
    const allianceHp = Number(data?.ai?.allianceHp || 0);
    const allianceMaxHp = Number(data?.ai?.allianceMaxHp || 1);
    return {
      mode: "TERRITORY_FRONTLINE",
      nodes: MAP_FALLBACK.map((node) => ({
        ...node,
        status: node.index < frontNodeIndex ? "ALLIANCE" : node.index === frontNodeIndex ? "CONTESTED" : "MONSTER",
        current: node.index === frontNodeIndex,
      })),
      currentFront: {
        phaseIndex,
        nodeIndex: frontNodeIndex,
        key: phase.key,
        name: MAP_FALLBACK[frontNodeIndex]?.name || phase.name,
        operationName: phase.name,
        subtitle: phase.subtitle,
        commanderName: phase.monsterName,
        commanderArt: phase.monsterImage,
        capturedFronts: phaseIndex,
        totalFronts: 5,
      },
      factions: {
        alliance: {
          name: "숲켓몬 연합",
          hp: allianceHp,
          maxHp: allianceMaxHp,
          percent: percent(allianceHp, allianceMaxHp),
        },
        monster: {
          name: "심연 몬스터 군단",
          hp: Number(phase.hp || 0),
          maxHp: Number(phase.maxHp || 1),
          percent: percent(phase.hp, phase.maxHp),
        },
      },
      formations: {
        defense: {
          name: `${phase.name || "현재 전선"} 방어대`,
          mission: "현재 몬스터 거점 주둔 · 유저 공략 저지",
          nodeIndex: frontNodeIndex,
          units: [],
        },
        assault: {
          name: `${phase.name || "현재 전선"} 돌격대`,
          mission: "연합 점령지 공격 · 거점 탈환",
          originNodeIndex: frontNodeIndex,
          targetNodeIndex: Math.max(0, frontNodeIndex - 1),
          nextActionAt: data?.ai?.nextActionAt,
          units: [],
        },
      },
    };
  }
  function reward() {
    const rewardState = data?.reward;
    if (!rewardState) return "";
    const items = [
      Number(rewardState.coin) > 0 ? { name: "코인", amount: rewardState.coin } : null,
      Number(rewardState.shards) > 0 ? { name: "카드 조각", amount: rewardState.shards } : null,
      ...(rewardState.items || []).map((item) => ({
        name: item.code === "VEHICLE_DRAW_TICKET" ? "이동수단 뽑기권" : item.code,
        amount: item.quantity,
      })),
    ].filter(Boolean);
    return `<section class="ms4-reward"><div><small>SIEGE SETTLEMENT READY</small><h3>연합 공성 보상</h3><p>지난 전선의 정산 보상을 수령할 수 있습니다.</p></div><div>${items
      .map((item) => `<span>${esc(item.name)} <b>×${fmt(item.amount)}</b></span>`)
      .join("")}</div><button data-ms-claim>보상 수령</button></section>`;
  }
  function showClaimReceipt(out) {
    const items = [
      Number(out.coin) > 0 ? ["코인", out.coin] : null,
      Number(out.shards) > 0 ? ["카드 조각", out.shards] : null,
      ...(out.items || []).map((item) => [
        item.code === "VEHICLE_DRAW_TICKET" ? "이동수단 뽑기권" : item.code,
        item.quantity,
      ]),
    ].filter(Boolean);
    const receipt = document.createElement("div");
    receipt.className = "ms-claim-receipt";
    receipt.innerHTML = `<section><div class="ms-claim-burst"><i></i><b>✓</b></div><small>REWARD ACQUIRED</small><h2>공성 보상 수령 완료</h2><p>보상이 인벤토리에 지급되었습니다.</p><div>${items
      .map(([name, amount]) => `<article><span>${esc(name)}</span><b>+${fmt(amount)}</b></article>`)
      .join("")}</div><button type="button">확인</button></section>`;
    overlay?.appendChild(receipt);
    receipt.querySelector("button").onclick = () => receipt.remove();
  }
  function unitList(formation) {
    const rows = formation?.units || [];
    return `<div class="ms4-unit-list">${
      rows
        .map(
          (entry) =>
            `<article class="${entry.status === "LEADING" ? "is-leading" : ""}"><img src="${esc(entry.image)}" alt="${esc(entry.name)}" loading="eager" decoding="async"><b>${esc(entry.name)}</b><small>${esc(entry.role)}</small></article>`,
        )
        .join("") || '<p class="ms4-empty-copy">부대 정보 확인 중</p>'
    }</div>`;
  }
  function formationPanel(formation, type) {
    const assault = type === "ASSAULT";
    return `<section class="ms4-formation ${assault ? "is-assault" : "is-defense"}"><header><div><small>${assault ? "MONSTER ASSAULT FORCE" : "MONSTER DEFENSE FORCE"}</small><b>${esc(formation?.name || (assault ? "몬스터 돌격대" : "몬스터 방어대"))}</b></div><em>${assault ? "이동 중" : "주둔 중"}</em></header>${unitList(formation)}<p>${esc(formation?.mission || "")}</p></section>`;
  }
  function mapUnitMarkup(campaign) {
    const nodes = campaign.nodes || MAP_FALLBACK;
    const frontNode = nodes.find((node) => Number(node.index) === Number(campaign.formations?.defense?.nodeIndex)) || nodes[1];
    const targetNode = nodes.find((node) => Number(node.index) === Number(campaign.formations?.assault?.targetNodeIndex)) || nodes[0];
    const defenseOffsets = [[-5, -15], [4, -13], [0, 9]];
    const assaultOffsets = [[-3, -10], [4, -3], [-4, 8]];
    const defense = (campaign.formations?.defense?.units || []).map((entry, index) => ({
      ...entry,
      kind: "DEFENSE",
      x: clamp(Number(frontNode.x) + defenseOffsets[index % defenseOffsets.length][0], 4, 96),
      y: clamp(Number(frontNode.y) + defenseOffsets[index % defenseOffsets.length][1], 10, 86),
    }));
    const baseX = Number(frontNode.x) * .56 + Number(targetNode.x) * .44;
    const baseY = Number(frontNode.y) * .56 + Number(targetNode.y) * .44;
    const assault = (campaign.formations?.assault?.units || []).map((entry, index) => ({
      ...entry,
      kind: "ASSAULT",
      x: clamp(baseX + assaultOffsets[index % assaultOffsets.length][0], 4, 96),
      y: clamp(baseY + assaultOffsets[index % assaultOffsets.length][1], 10, 86),
    }));
    return [...defense, ...assault]
      .map(
        (entry) =>
          `<figure class="ms4-map-unit is-${entry.kind.toLowerCase()} ${entry.status === "LEADING" ? "is-leading" : ""}" style="--x:${entry.x}%;--y:${entry.y}%"><img src="${esc(entry.image)}" alt="${esc(entry.name)}"><figcaption><small>${entry.kind === "DEFENSE" ? "방어대" : "돌격대"}</small><b>${esc(entry.name)}</b></figcaption></figure>`,
      )
      .join("");
  }
  function mapHtml(campaign, rallyOpen) {
    const nodes = campaign.nodes || MAP_FALLBACK;
    const current = campaign.currentFront || {};
    const frontNode = nodes.find((node) => Number(node.index) === Number(current.nodeIndex)) || nodes[1];
    const targetNode =
      nodes.find((node) => Number(node.index) === Number(campaign.formations?.assault?.targetNodeIndex)) || nodes[0];
    const points = nodes.map((node) => `${Number(node.x) * 10},${Number(node.y) * 6}`).join(" ");
    const statusLabel = (status) =>
      status === "ALLIANCE" ? "연합 점령" : status === "MONSTER" ? "몬스터 점령" : "현재 교전";
    const nodeClass = (status) =>
      status === "ALLIANCE" ? "is-alliance" : status === "MONSTER" ? "is-monster" : "is-contested";
    return `<section class="ms4-map-shell" aria-label="몬스터공성 전황 지도">
      <picture class="ms4-map-art" aria-hidden="true"><source srcset="/assets/ui/territory-war/territory-command-map-v1824.avif?v=1824" type="image/avif"><img src="/assets/ui/territory-war/territory-command-map-v1824.webp?v=1824" alt="" decoding="async"></picture>
      <div class="ms4-map-shade" aria-hidden="true"></div>
      <div class="ms4-map-head"><div><span class="alliance"><i></i>연합 점령</span><span class="contested"><i></i>현재 교전</span><span class="monster"><i></i>몬스터 점령</span></div><b>TACTICAL CAMPAIGN MAP</b></div>
      <svg class="ms4-map-routes" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id="ms4AssaultArrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="#ff667a"></path></marker></defs>
        <polygon class="alliance-zone" points="0,0 ${Number(frontNode.x) * 10},0 ${Number(frontNode.x) * 10},600 0,600"></polygon>
        <polygon class="monster-zone" points="${Number(frontNode.x) * 10},0 1000,0 1000,600 ${Number(frontNode.x) * 10},600"></polygon>
        <polyline class="campaign-route" points="${points}"></polyline>
        <line class="active-route" x1="${Number(frontNode.x) * 10}" y1="${Number(frontNode.y) * 6}" x2="${Number(targetNode.x) * 10}" y2="${Number(targetNode.y) * 6}" marker-end="url(#ms4AssaultArrow)"></line>
        <circle class="front-ring" cx="${Number(frontNode.x) * 10}" cy="${Number(frontNode.y) * 6}" r="54"></circle>
      </svg>
      <div class="ms4-map-nodes" role="list" aria-label="공성 거점">${nodes
        .map(
          (node) =>
            `<div class="ms4-node ${nodeClass(node.status)}" style="--x:${node.x}%;--y:${node.y}%" role="listitem" aria-label="${esc(node.name)} · ${statusLabel(node.status)}"><i>${String(Number(node.index) + 1).padStart(2, "0")}</i><div><b>${esc(node.name)}</b><small>${statusLabel(node.status)}</small></div></div>`,
        )
        .join("")}</div>
      <div class="ms4-map-units">${mapUnitMarkup(campaign)}</div>
      <div class="ms4-map-caption"><div><small>CURRENT FRONT · ${esc(current.key || "")}</small><b>${esc(current.name || current.operationName || "현재 전선")} · 방어대 주둔 / 돌격대 진군</b></div><strong data-ms-ai-clock>${rallyOpen ? "집결 대기" : `다음 돌격 ${clock(campaign.formations?.assault?.nextActionAt)}`}</strong></div>
    </section>`;
  }
  function ranking() {
    const rows = data?.ranking || [];
    return `<section class="ms4-ranking"><header><div><small>ALLIANCE CONTRIBUTION</small><h3>연합 전공 순위</h3></div><span>TOP 20</span></header><div>${
      rows
        .map(
          (row, index) =>
            `<article><b>${String(index + 1).padStart(2, "0")}</b><span>${esc(row.nickname)}<small>${fmt(row.attacks)}회 출전</small></span><strong>${fmt(row.damage)}</strong></article>`,
        )
        .join("") || '<p class="ms4-empty-copy">첫 공성 기록을 기다리고 있습니다.</p>'
    }</div></section>`;
  }
  function aiFeed() {
    const actions = data?.ai?.recentActions || [];
    return `<section class="ms4-log"><header><div><small>MONSTER ASSAULT LOG</small><h3>돌격대 작전 기록</h3></div><span>LIVE</span></header><div>${
      actions
        .map((action) => {
          const breakthrough = action.actionType === "BREAKTHROUGH";
          const skill = action.actionType === "SKILL";
          const unitName = action.assaultUnit?.name ? `${action.assaultUnit.name} · ` : "";
          return `<article class="${breakthrough ? "is-breakthrough" : skill ? "is-skill" : ""}"><i>${breakthrough ? "R" : skill ? "!" : "A"}</i><div><b>${esc(unitName + action.skillName)}</b><p>${esc(action.description)}</p><span>연합 진영 피해 <strong>${fmt(action.damage)}</strong>${Number(action.healing) > 0 ? ` · 몬스터 진영 회복 +${fmt(action.healing)}` : ""}${Number(action.ticks) > 1 ? ` · ${fmt(action.ticks)}차 공세` : ""}</span></div><time>${timeLabel(action.createdAt)}</time></article>`;
        })
        .join("") || '<p class="ms4-empty-copy">몬스터 돌격대가 다음 공격 경로를 계산하고 있습니다.</p>'
    }</div></section>`;
  }
  function maybeShowAiBriefing() {
    const action = data?.ai?.recentActions?.[0];
    if (!action || !["SKILL", "BREAKTHROUGH"].includes(action.actionType) || !overlay) return;
    const age = serverClockNow() - serverTimestamp(action.createdAt);
    if (!Number.isFinite(age) || age < -5000 || age > 90000) return;
    const key = `cnine-siege-ai-briefing:${data.event?.id}:${action.id}`;
    if (localStorage.getItem(key) || document.querySelector(".ms4-operation-briefing")) return;
    localStorage.setItem(key, "1");
    const campaign = campaignState();
    const briefing = document.createElement("div");
    briefing.className = "ms4-operation-briefing";
    briefing.innerHTML = `<section role="dialog" aria-modal="true" aria-label="몬스터 돌격대 작전 발동"><img src="${esc(action.assaultUnit?.image || campaign.currentFront?.commanderArt || "")}" alt="${esc(action.assaultUnit?.name || "몬스터 돌격대")}"><div class="ms4-briefing-shade"></div><div class="ms4-briefing-copy"><small>${esc(action.role || "MONSTER ASSAULT")} · HOSTILE AI</small><h2>${esc(action.skillName)}</h2><p>${esc(action.description)}</p><div><span>연합 진영 피해 <b>${fmt(action.damage)}</b></span>${Number(action.healing) > 0 ? `<span>몬스터 진영 회복 <b>+${fmt(action.healing)}</b></span>` : ""}${action.effect ? `<span>방어대 피해 감소 <b>${fmt(action.effect.percent)}%</b></span>` : ""}</div><button type="button">전황 지휘 계속</button></div></section>`;
    document.body.appendChild(briefing);
    const closeBriefing = () => {
      briefing.classList.add("is-closing");
      setTimeout(() => briefing.remove(), 280);
    };
    briefing.onclick = (event) => {
      if (event.target === briefing || event.target.closest("button")) closeBriefing();
    };
    requestAnimationFrame(() => briefing.classList.add("show"));
  }
  function renderEmpty() {
    overlay.innerHTML = `<main class="ms4-shell ms4-empty"><header class="ms4-header"><div class="ms4-title"><small>SOOPKETMON ALLIANCE COMMAND</small><h1>몬스터 공성전</h1><p>지도형 진영전 작전 대기</p></div><button class="ms4-close" data-ms-close aria-label="닫기">×</button></header><section class="ms4-empty-state"><b>현재 진행 중인 공성전이 없습니다.</b><span>다음 몬스터 군단의 전선 침공을 기다리고 있습니다.</span>${reward()}</section></main>`;
    bind();
  }
  function userCommand(mine, rallyOpen) {
    const energy = Math.max(0, Number(mine?.energy || 0));
    const maxEnergy = Math.max(1, Number(mine?.maxEnergy || 5));
    return `<section class="ms4-user-command"><header><div><small>ALLIANCE FIELD UNIT</small><h3>${mine ? "나의 전선 출전" : "공성 부대 집결"}</h3></div><span>${mine ? "DEPLOYED" : "STANDBY"}</span></header><div class="ms4-user-stats"><article><small>진영 피해 기여</small><b>${fmt(mine?.damage || 0)}</b></article><article><small>출전 횟수</small><b>${fmt(mine?.attacks || 0)}</b></article><article><small>PVE 전투력</small><b>${fmt(mine?.deckPower || 0)}</b></article></div>${mine ? `<div class="ms4-energy"><header><span>보유 공격권</span><b data-ms-energy-count>${energy} / ${maxEnergy}</b></header><div><i style="width:${Math.min(100, (energy / maxEnergy) * 100)}%"></i></div><small data-ms-energy-timer>${energy >= maxEnergy ? `공격권 충전 완료 · 최대 ${maxEnergy}회` : `다음 공격권 ${rechargeClock(mine.nextRechargeAt)} · ${rechargeRule(mine)}`}</small></div>` : ""}<button class="ms4-attack" data-ms-${mine ? "attack" : "join"} ${busy || (mine && !rallyOpen && energy < 1) ? "disabled" : ""}><span>${mine ? "현재 거점 방어대 공격" : "공성전 참가 신청"}</span><small>${mine ? "공격권 1개 사용 · 저장된 PVE 덱으로 방어대와 교전" : "집결 종료 전 PVE 덱 5장 필요"}</small></button></section>`;
  }
  function operationPanel(campaign) {
    const ai = data?.ai || {};
    const profile = ai.profile || data?.phase?.ai || {};
    const effect = ai.currentEffect;
    const threat = ai.threat || { label: "탐색 태세", rage: 0 };
    const lead = campaign.formations?.assault?.units?.find((entry) => entry.status === "LEADING");
    return `<section class="ms4-operation"><header><div><small>ASSAULT FORCE FORECAST</small><h3>돌격대 작전 분석</h3></div><span>SEQ ${String(ai.sequence || 0).padStart(3, "0")}</span></header><div class="ms4-operation-body"><span>${esc(profile.code || "UNKNOWN")} · ${esc(lead?.name || "돌격대 지휘 대기")}</span><h4>${esc(profile.skillName || "작전 분석 중")}</h4><p>${esc(profile.description || "몬스터 돌격대의 다음 이동과 공격 목표를 분석하고 있습니다.")}</p><div class="ms4-operation-meta"><small>작전 주기 <b>${fmt(profile.skillEvery || 0)}회</b></small><small>방어대 장막 <b>${fmt(profile.shieldPercent || 0)}%</b></small><small>현재 태세 <b>${esc(threat.label)}</b></small><small>다음 목표 <b>거점 ${fmt(Number(campaign.formations?.assault?.targetNodeIndex || 0) + 1)}</b></small></div></div>${effect ? `<div class="ms4-active-effect"><span><small>ACTIVE DEFENSE EFFECT</small><b>${esc(profile.skillName)} · 몬스터 진영 피해 ${fmt(effect.percent)}% 감소</b></span><strong data-ms-effect-clock>${clock(effect.endsAt)}</strong></div>` : ""}</section>`;
  }
  function render() {
    if (!overlay || !data) return;
    syncServerClock(data);
    const event = data.event;
    if (!event) {
      renderEmpty();
      return;
    }
    const campaign = campaignState();
    const current = campaign.currentFront || {};
    const factions = campaign.factions || {};
    const alliance = factions.alliance || {};
    const monster = factions.monster || {};
    const mine = data.mine;
    const rallyOpen = event.rallyOpen === true;
    const alliancePercent = percent(alliance.hp, alliance.maxHp);
    const monsterPercent = percent(monster.hp, monster.maxHp);
    overlay.innerHTML = `<main class="ms4-shell phase-${String(current.key || "outer").toLowerCase()}"><header class="ms4-header"><div class="ms4-title"><small>SOOPKETMON · MONSTER TERRITORY SIEGE</small><h1>${esc(event.name)}</h1><p>영토전형 전황 지도 · 몬스터 돌격대와 방어대가 독립 작전 중</p></div><div class="ms4-live"><span><i></i>${rallyOpen ? "MUSTER" : "LIVE FRONT"}</span><small>${rallyOpen ? "집결 종료까지" : "공성 종료까지"}</small><b data-ms-clock>${clock(rallyOpen ? event.rallyEndsAt : event.endsAt)}</b></div><button class="ms4-close" data-ms-close aria-label="공성전 닫기">×</button></header><section class="ms4-scoreboard" aria-label="현재 전선 양 진영 체력"><article class="ms4-faction is-alliance"><div><small>숲켓몬 연합 진영 체력</small><strong>${fmt(alliance.hp)} / ${fmt(alliance.maxHp)}</strong></div><em><i style="width:${alliancePercent}%"></i></em><span>현재 전선 유지율 ${alliancePercent.toFixed(1)}%</span></article><div class="ms4-front-title"><small>CURRENT CONTESTED FRONT</small><b>${esc(current.name || current.operationName)}</b><span>${fmt(Number(current.capturedFronts || 0))} / ${fmt(Number(current.totalFronts || 5))} 거점 확보</span></div><article class="ms4-faction is-monster"><div><small>몬스터 군단 진영 체력</small><strong>${fmt(monster.hp)} / ${fmt(monster.maxHp)}</strong></div><em><i style="width:${monsterPercent}%"></i></em><span>현재 전선 유지율 ${monsterPercent.toFixed(1)}%</span></article></section>${reward()}<section class="ms4-war-grid">${mapHtml(campaign, rallyOpen)}<aside class="ms4-front-column"><section class="ms4-commander"><img src="${esc(current.commanderArt || data.phase?.monsterImage || "")}" alt=""><div><small>FRONT COMMANDER · BACKGROUND ART</small><h2>${esc(current.commanderName || "몬스터 전선 지휘관")}</h2><p>${esc(current.subtitle || "방어대가 거점을 지키고 돌격대가 연합 점령지를 공격합니다.")}</p></div></section>${formationPanel(campaign.formations?.defense, "DEFENSE")}${formationPanel(campaign.formations?.assault, "ASSAULT")}</aside></section><section class="ms4-console"><div class="ms4-command-stack">${operationPanel(campaign)}${userCommand(mine, rallyOpen)}</div><aside class="ms4-intel-stack">${aiFeed()}${ranking()}</aside></section></main>`;
    const actionButton = overlay.querySelector(".ms4-attack");
    const energy = Math.max(0, Number(mine?.energy || 0));
    if (actionButton && rallyOpen && mine) {
      actionButton.disabled = true;
      actionButton.querySelector("span").textContent = "집결 완료";
      actionButton.querySelector("small").textContent = "전투 개시 후 현재 거점 방어대를 공격할 수 있습니다.";
    } else if (actionButton && !rallyOpen && !mine) {
      actionButton.disabled = true;
      actionButton.removeAttribute("data-ms-join");
      actionButton.querySelector("span").textContent = "참여 마감";
      actionButton.querySelector("small").textContent = "집결 시간이 종료되었습니다.";
    } else if (actionButton && mine && !rallyOpen && energy < 1) {
      actionButton.querySelector("span").textContent = "공격권 충전 중";
      actionButton.querySelector("small").textContent = rechargeRule(mine);
    }
    bind();
    maybeShowAiBriefing();
  }
  function bind() {
    overlay?.querySelector("[data-ms-close]")?.addEventListener("click", close);
    overlay?.querySelector("[data-ms-join]")?.addEventListener("click", join);
    overlay?.querySelector("[data-ms-attack]")?.addEventListener("click", attack);
    overlay?.querySelector("[data-ms-claim]")?.addEventListener("click", claim);
  }
  async function load(silent = false) {
    if (pollBusy) return;
    pollBusy = true;
    try {
      const next = await api("siege/state");
      const signature = renderSignature(next);
      syncServerClock(next);
      data = next;
      if (!silent || signature !== lastRenderSignature) {
        lastRenderSignature = signature;
        render();
      }
    } finally {
      pollBusy = false;
    }
  }
  async function join() {
    if (busy) return;
    busy = true;
    render();
    try {
      data = await api("siege/join", { method: "POST", body: "{}" });
      lastRenderSignature = renderSignature(data);
    } catch (error) {
      alert(error.message);
    } finally {
      busy = false;
      render();
    }
  }
  async function attack() {
    if (busy) return;
    busy = true;
    render();
    let modal = document.getElementById("modal");
    let renderer = null;
    try {
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "modal";
        document.body.appendChild(modal);
      }
      const campaign = campaignState();
      const defender = campaign.formations?.defense?.units?.[0] || {};
      const live =
        typeof window.prepareBattleV2LiveLoading === "function"
          ? window.prepareBattleV2LiveLoading({
              modal,
              mode: "PVE",
              playerName: "ALLIANCE FRONT UNIT",
              opponentName: defender.name || "MONSTER DEFENSE FORCE",
              autoText: "현재 거점 방어대와의 교전을 계산하고 있습니다.",
            })
          : null;
      modal.classList.add("siege-v2-battle-modal");
      const out = await api("siege/attack", {
        method: "POST",
        body: JSON.stringify({ requestId: requestId() }),
      });
      if (out.battleV2 && live && typeof window.playSiegeBattleV2Live === "function") {
        renderer = await window.playSiegeBattleV2Live({
          stage: live.stage,
          phase: live.phase,
          msg: live.msg,
          modal,
          data: out,
          monster: out.monster,
          playUltimateCinematics: true,
        });
        const message = modal.querySelector("#battleMessage");
        if (message) {
          modal.appendChild(message);
          message.className = "battle-message battle-v2-live-result is-visible siege-v2-result";
          message.innerHTML = `<small>${out.result === "WIN" ? "DEFENSE LINE BREACHED" : "DEFEAT · FACTION CONTRIBUTION"}</small><strong>${out.result === "WIN" ? "승리" : "패배"}</strong><b>몬스터 진영 피해 ${fmt(out.damage)}</b><span>교전 상대 ${esc(out.monster?.name || "방어대")} · 기본 기여 ${fmt(out.baseContribution)} · 적용 ${fmt(out.contributionPercent)}% · 적 전투력 ${fmt(out.monsterPower)}${Number(out.monsterDamageReductionPercent) > 0 ? ` · 방어대 장막 ${fmt(out.monsterDamageReductionPercent)}%` : ""}</span>${out.result === "WIN" ? `<div class="siege-v2-win-reward"><small>1판 승리 보상</small><b>코인 ${fmt(out.winReward?.coin)} · 카드 조각 ${fmt(out.winReward?.shards)}${out.winReward?.items?.length ? ` · ${out.winReward.items.map((item) => `${item.code} ×${fmt(item.quantity)}`).join(" · ")}` : ""}</b></div>` : ""}<button type="button" data-siege-battle-confirm>전황 지도로 복귀</button>`;
          renderer.showResult();
          await new Promise((resolve) => {
            const done = () => resolve();
            message.querySelector("[data-siege-battle-confirm]")?.addEventListener("click", done, {
              once: true,
            });
            modal.addEventListener("click", (event) => event.target === modal && done(), { once: true });
          });
        }
      }
      data = out.state;
      lastRenderSignature = renderSignature(data);
      renderer?.destroy?.();
      modal.className = "modal";
      modal.innerHTML = "";
      render();
      overlay.querySelector(".ms4-map-shell")?.classList.add("front-impact");
      setTimeout(() => overlay?.querySelector(".ms4-map-shell")?.classList.remove("front-impact"), 700);
      if (out.phaseCleared)
        alert(
          out.eventCleared
            ? "심연 성채를 점령했습니다. 숲켓몬 연합의 공성 승리!"
            : "몬스터 진영 체력이 붕괴했습니다. 다음 거점으로 전선이 전진합니다.",
        );
    } catch (error) {
      renderer?.destroy?.();
      if (modal) {
        modal.className = "modal";
        modal.innerHTML = "";
      }
      alert(error.message);
    } finally {
      busy = false;
      render();
    }
  }
  async function claim() {
    if (busy) return;
    busy = true;
    try {
      const out = await api("siege/claim", { method: "POST", body: "{}" });
      await load();
      showClaimReceipt(out);
    } catch (error) {
      alert(error.message);
    } finally {
      busy = false;
    }
  }
  function tick() {
    const event = data?.event;
    if (!overlay || !event) return;
    const rallyOpen =
      event.rallyOpen === true && serverTimestamp(event.rallyEndsAt) > serverClockNow();
    const mainClock = overlay.querySelector("[data-ms-clock]");
    const aiClock = overlay.querySelector("[data-ms-ai-clock]");
    const effectClock = overlay.querySelector("[data-ms-effect-clock]");
    const energyTimer = overlay.querySelector("[data-ms-energy-timer]");
    if (mainClock) mainClock.textContent = clock(rallyOpen ? event.rallyEndsAt : event.endsAt);
    if (aiClock && !rallyOpen)
      aiClock.textContent = `다음 돌격 ${clock(campaignState().formations?.assault?.nextActionAt)}`;
    if (effectClock) effectClock.textContent = clock(data.ai?.currentEffect?.endsAt);
    if (energyTimer && data.mine) {
      const energy = Number(data.mine.energy || 0);
      const max = Number(data.mine.maxEnergy || 5);
      energyTimer.textContent =
        energy >= max
          ? `공격권 충전 완료 · 최대 ${max}회`
          : `다음 공격권 ${rechargeClock(data.mine.nextRechargeAt)} · ${rechargeRule(data.mine)}`;
    }
    if (!busy && Date.now() - lastPollAt >= 5000) {
      lastPollAt = Date.now();
      load(true).catch(() => {});
    }
  }
  async function open() {
    if (overlay) return;
    syncViewport();
    document.body.classList.add("monster-siege-open");
    overlay = document.createElement("div");
    overlay.className = `ms-overlay ms4-overlay${(() => {
      try {
        return window.self !== window.top ? " is-wago" : "";
      } catch {
        return " is-wago";
      }
    })()}`;
    overlay.innerHTML = '<div class="ms-loading">몬스터공성 전황 지도를 불러오는 중...</div>';
    document.body.appendChild(overlay);
    try {
      await load();
      timer = setInterval(tick, 1000);
    } catch (error) {
      overlay.innerHTML = `<main class="ms4-shell ms4-empty"><header class="ms4-header"><div class="ms4-title"><small>SIEGE CONNECTION LOST</small><h1>공성전 진입 실패</h1></div><button class="ms4-close" data-ms-close>×</button></header><section class="ms4-empty-state"><b>전황 정보를 불러오지 못했습니다.</b><span>${esc(error.message)}</span></section></main>`;
      bind();
    }
  }
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener("load", inject);
  addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay && !document.querySelector(".ms4-operation-briefing"))
      close();
  });
  inject();
  globalThis.openMonsterSiege = open;
})();
