(() => {
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
  const fmt = (value) => Number(value || 0).toLocaleString("ko-KR");
  const percent = (value, max) =>
    Math.max(0, Math.min(100, (Number(value || 0) / Math.max(1, Number(max || 1))) * 100));
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
  const requestId = () => `SIEGE:${crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  function serverTimestamp(value) {
    if (value instanceof Date) return value.getTime();
    const raw = String(value || "").trim();
    if (!raw) return NaN;
    return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw);
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
  function timeLabel(value) {
    const milliseconds = serverClockNow() - serverTimestamp(value);
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return "방금 전";
    if (milliseconds < 60000) return `${Math.max(1, Math.floor(milliseconds / 1000))}초 전`;
    if (milliseconds < 3600000) return `${Math.floor(milliseconds / 60000)}분 전`;
    return new Date(serverTimestamp(value)).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }
  function renderSignature(payload) {
    return [
      payload?.event?.id || 0,
      payload?.event?.version || 0,
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
    button.innerHTML = "<span>몬스터 공성전</span><small>AI SIEGE</small>";
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
    document.querySelector(".ms3-operation-briefing")?.remove();
    overlay?.remove();
    overlay = null;
    data = null;
    lastRenderSignature = "";
    document.body.classList.remove("monster-siege-open");
  }
  function phaseTrack() {
    const phases = data.settings.phases,
      current = Number(data.event?.phaseIndex || 0);
    return `<nav class="ms3-phase-track" aria-label="몬스터 공성 진행 단계">${phases
      .map(
        (phase, index) =>
          `<div class="${index < current ? "done" : index === current ? "active" : ""}"><i>${index < current ? "✓" : String(index + 1).padStart(2, "0")}</i><span>${esc(phase.name)}</span><small>${esc(phase.ai?.role || `PHASE ${index + 1}`)}</small></div>`,
      )
      .join("")}</nav>`;
  }
  function ranking() {
    const rows = data.ranking || [];
    return `<section class="ms3-ranking"><header><div><small>ALLIANCE CONTRIBUTION</small><h3>연합 전공 순위</h3></div><span>TOP 20</span></header><div>${
      rows
        .map(
          (row, index) =>
            `<article><b>${String(index + 1).padStart(2, "0")}</b><span>${esc(row.nickname)}<small>${fmt(row.attacks)}회 출전</small></span><strong>${fmt(row.damage)}</strong></article>`,
        )
        .join("") || '<p class="ms3-empty-copy">첫 공성 기록을 기다리고 있습니다.</p>'
    }</div></section>`;
  }
  function reward() {
    const rewardState = data.reward;
    if (!rewardState) return "";
    const items = [
      Number(rewardState.coin) > 0 ? { icon: "◈", name: "코인", amount: rewardState.coin } : null,
      Number(rewardState.shards) > 0 ? { icon: "◆", name: "카드 조각", amount: rewardState.shards } : null,
      ...(rewardState.items || []).map((item) => ({
        icon: "✦",
        name: item.code === "VEHICLE_DRAW_TICKET" ? "이동수단 뽑기권" : item.code,
        amount: item.quantity,
      })),
    ].filter(Boolean);
    return `<section class="ms3-reward"><div><small>SIEGE SETTLEMENT READY</small><h3>연합 공성 보상</h3><p>지난 전선의 정산 보상을 수령할 수 있습니다.</p></div><div>${items
      .map((item) => `<span><i>${item.icon}</i>${esc(item.name)} <b>×${fmt(item.amount)}</b></span>`)
      .join("")}</div><button data-ms-claim>보상 수령</button></section>`;
  }
  function showClaimReceipt(out) {
    const items = [
      Number(out.coin) > 0 ? ["코인", out.coin] : null,
      Number(out.shards) > 0 ? ["카드 조각", out.shards] : null,
      ...(out.items || []).map((item) => [item.code === "VEHICLE_DRAW_TICKET" ? "이동수단 뽑기권" : item.code, item.quantity]),
    ].filter(Boolean);
    const receipt = document.createElement("div");
    receipt.className = "ms-claim-receipt";
    receipt.innerHTML = `<section><div class="ms-claim-burst"><i></i><b>✓</b></div><small>REWARD ACQUIRED</small><h2>공성 보상 수령 완료</h2><p>보상이 인벤토리에 지급되었습니다.</p><div>${items
      .map(([name, amount]) => `<article><span>${esc(name)}</span><b>+${fmt(amount)}</b></article>`)
      .join("")}</div><button type="button">확인</button></section>`;
    overlay.appendChild(receipt);
    receipt.querySelector("button").onclick = () => receipt.remove();
  }
  function aiFeed() {
    const actions = data.ai?.recentActions || [];
    return `<section class="ms3-ai-feed"><header><div><small>HOSTILE ACTION LOG</small><h3>몬스터 작전 기록</h3></div><span><i></i> LIVE</span></header><div>${
      actions
        .map(
          (action) =>
            `<article class="${action.actionType === "SKILL" ? "is-skill" : ""}"><i>${action.actionType === "SKILL" ? "!" : "↘"}</i><div><b>${esc(action.skillName)}</b><p>${esc(action.description)}</p><span>성채 피해 <strong>${fmt(action.damage)}</strong>${Number(action.healing) > 0 ? ` · 전선 회복 <em>+${fmt(action.healing)}</em>` : ""}${Number(action.ticks) > 1 ? ` · ${fmt(action.ticks)}차 공세` : ""}</span></div><time>${timeLabel(action.createdAt)}</time></article>`,
        )
        .join("") || '<p class="ms3-empty-copy">AI가 연합군의 움직임을 분석하고 있습니다.</p>'
    }</div></section>`;
  }
  function maybeShowAiBriefing() {
    const action = data?.ai?.recentActions?.[0];
    if (!action || action.actionType !== "SKILL" || !overlay) return;
    const age = serverClockNow() - serverTimestamp(action.createdAt);
    if (!Number.isFinite(age) || age < -5000 || age > 90000) return;
    const key = `cnine-siege-ai-briefing:${data.event?.id}:${action.id}`;
    if (localStorage.getItem(key) || document.querySelector(".ms3-operation-briefing")) return;
    localStorage.setItem(key, "1");
    const briefing = document.createElement("div");
    briefing.className = "ms3-operation-briefing";
    briefing.innerHTML = `<section role="dialog" aria-modal="true" aria-label="몬스터 작전 발동"><img src="${esc(data.phase?.monsterImage || "")}" alt="${esc(data.phase?.monsterName || "몬스터")} 작전"><div class="ms3-briefing-shade"></div><div class="ms3-briefing-copy"><small>${esc(action.role || "MONSTER OPERATION")} · HOSTILE AI</small><h2>${esc(action.skillName)}</h2><p>${esc(action.description)}</p><div><span>성채 피해 <b>${fmt(action.damage)}</b></span>${Number(action.healing) > 0 ? `<span>몬스터 회복 <b>+${fmt(action.healing)}</b></span>` : ""}${action.effect ? `<span>공성 피해 감소 <b>${fmt(action.effect.percent)}%</b></span>` : ""}</div><button type="button">전황 지휘 계속</button></div></section>`;
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
    overlay.innerHTML = `<main class="ms3-shell ms3-empty"><header class="ms3-header"><div><small>SOOPKETMON ALLIANCE COMMAND</small><h1>몬스터 공성전</h1></div><button data-ms-close aria-label="닫기">×</button></header><section><b>현재 진행 중인 공성전이 없습니다.</b><span>다음 몬스터 군단의 침공 명령을 기다리고 있습니다.</span>${reward()}</section></main>`;
    bind();
  }
  function render() {
    if (!overlay || !data) return;
    syncServerClock(data);
    const cfg = data.settings,
      event = data.event,
      phase = data.phase,
      mine = data.mine,
      ai = data.ai,
      rallyOpen = event?.rallyOpen === true;
    if (!event) {
      renderEmpty();
      return;
    }
    const monsterPercent = percent(phase.hp, phase.maxHp),
      alliancePercent = percent(ai?.allianceHp, ai?.allianceMaxHp),
      energy = Math.max(0, Number(mine?.energy || 0)),
      maxEnergy = Math.max(1, Number(mine?.maxEnergy || 5)),
      effect = ai?.currentEffect,
      profile = ai?.profile || phase.ai || {},
      threat = ai?.threat || { level: "PROBE", label: "탐색 태세", rage: 0 };
    overlay.innerHTML = `<main class="ms3-shell phase-${String(phase.key || "outer").toLowerCase()}" style="--ms3-art:url('${esc(phase.monsterImage || "")}')"><header class="ms3-header"><div class="ms3-title"><small>SOOPKETMON ALLIANCE · AI MONSTER SIEGE</small><h1>${esc(event.name)}</h1><p>${esc(phase.subtitle)}</p></div><div class="ms3-live"><span><i></i>${rallyOpen ? "MUSTER" : "LIVE WAR"}</span><small>${rallyOpen ? "집결 종료까지" : "공성 종료까지"}</small><b data-ms-clock>${clock(rallyOpen ? event.rallyEndsAt : event.endsAt)}</b></div><button data-ms-close aria-label="공성전 닫기">×</button></header>${phaseTrack()}${reward()}<section class="ms3-theater"><header><div><small>CONTESTED FRONT · PHASE ${Number(phase.index) + 1}</small><h2>${esc(phase.name)}</h2><span>${esc(phase.monsterName)}가 연합 성채를 향해 진군 중입니다.</span></div><div class="ms3-threat is-${String(threat.level || "probe").toLowerCase()}"><small>AI THREAT</small><b>${esc(threat.label)}</b><span>분노 ${fmt(threat.rage)}%</span></div></header><div class="ms3-frontline"><article class="ms3-force is-alliance"><small>ALLIANCE CITADEL</small><h3>숲켓몬 연합 성채</h3><strong>${fmt(ai?.allianceHp)} <em>/ ${fmt(ai?.allianceMaxHp)}</em></strong><div><i style="width:${alliancePercent}%"></i></div><span>방어선 무결성 ${alliancePercent.toFixed(1)}%</span></article><div class="ms3-monster-visual"><div class="ms3-scan"></div><img src="${esc(phase.monsterImage)}" alt="${esc(phase.monsterName)}"><b>VS</b></div><article class="ms3-force is-monster"><small>${esc(profile.role || "MONSTER FRONT")}</small><h3>${esc(phase.monsterName)}</h3><strong>${fmt(phase.hp)} <em>/ ${fmt(phase.maxHp)}</em></strong><div><i style="width:${monsterPercent}%"></i></div><span>적 전선 잔존 ${monsterPercent.toFixed(1)}%</span></article></div><div class="ms3-ai-clock"><span><i></i>MONSTER AI ACTIVE</span><p>${rallyOpen ? "집결 종료 후 몬스터의 자율 공세가 시작됩니다." : `${esc(profile.skillName || "전용 작전")} 준비 · ${fmt(ai?.nextSkillIn || 1)}회 행동 내 발동`}</p><strong>${rallyOpen ? "STANDBY" : `다음 공격 ${clock(ai?.nextActionAt)}`}</strong></div></section><section class="ms3-console"><div class="ms3-command-column"><section class="ms3-operation"><header><div><small>HOSTILE OPERATION FORECAST</small><h3>몬스터 작전 분석</h3></div><b>${String(ai?.sequence || 0).padStart(3, "0")}</b></header><div class="ms3-operation-card"><span>${esc(profile.code || "UNKNOWN")}</span><h4>${esc(profile.skillName || "작전 분석 중")}</h4><p>${esc(profile.description || "몬스터의 다음 행동을 분석하고 있습니다.")}</p><div><small>작전 주기 <b>${fmt(profile.skillEvery || 0)}회</b></small><small>공성 피해 방어 <b>${fmt(profile.shieldPercent || 0)}%</b></small><small>현재 태세 <b>${esc(threat.label)}</b></small></div></div>${effect ? `<div class="ms3-active-effect"><i>!</i><span><small>ACTIVE MONSTER EFFECT</small><b>${esc(profile.skillName)} · 공성 피해 ${fmt(effect.percent)}% 감소</b></span><strong data-ms-effect-clock>${clock(effect.endsAt)}</strong></div>` : ""}</section><section class="ms3-my-command"><header><div><small>ALLIANCE FIELD COMMAND</small><h3>${mine ? "나의 공성 지휘" : "공성 부대 편성"}</h3></div><span>${mine ? "DEPLOYED" : "STANDBY"}</span></header><div class="ms3-my-stats"><article><small>MY DAMAGE</small><b>${fmt(mine?.damage || 0)}</b></article><article><small>SORTIES</small><b>${fmt(mine?.attacks || 0)}</b></article><article><small>PVE POWER</small><b>${fmt(mine?.deckPower || 0)}</b></article></div>${mine ? `<div class="ms3-energy"><header><span>공성 출전 횟수</span><b data-ms-energy-count>${energy} / ${maxEnergy}</b></header><div><i data-ms-energy-fill style="width:${Math.min(100, (energy / maxEnergy) * 100)}%"></i></div><small data-ms-energy-timer>${energy >= maxEnergy ? "충전 완료" : `다음 충전 ${rechargeClock(mine.nextRechargeAt)}`}</small></div>` : ""}<button class="ms3-attack" data-ms-${mine ? "attack" : "join"} ${busy || (mine && (!rallyOpen && energy < 1)) ? "disabled" : ""}><span>${mine ? "전선 공성 공격" : "공성전 참가 신청"}</span><small>${mine ? "저장된 PVE 덱으로 몬스터 전선 돌파" : "집결 종료 전 PVE 덱 5장 필요"}</small></button></section></div><aside class="ms3-intel-column">${aiFeed()}${ranking()}</aside></section></main>`;
    const actionButton = overlay.querySelector(".ms3-attack");
    if (actionButton && rallyOpen && mine) {
      actionButton.disabled = true;
      actionButton.querySelector("span").textContent = "집결 완료";
      actionButton.querySelector("small").textContent = "전투 개시와 함께 몬스터 AI가 작전을 시작합니다.";
    } else if (actionButton && !rallyOpen && !mine) {
      actionButton.disabled = true;
      actionButton.removeAttribute("data-ms-join");
      actionButton.querySelector("span").textContent = "참여 마감";
      actionButton.querySelector("small").textContent = "집결 시간이 종료되었습니다.";
    } else if (actionButton && mine && !rallyOpen && energy < 1) {
      actionButton.querySelector("span").textContent = "출전 횟수 충전 중";
      actionButton.querySelector("small").textContent = "5분마다 1회 충전됩니다.";
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
      const next = await api("siege/state"),
        signature = renderSignature(next);
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
    let modal = document.getElementById("modal"),
      renderer = null;
    try {
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "modal";
        document.body.appendChild(modal);
      }
      const phase = data?.phase || {},
        live =
          typeof window.prepareBattleV2LiveLoading === "function"
            ? window.prepareBattleV2LiveLoading({
                modal,
                mode: "PVE",
                playerName: "SIEGE PARTY",
                opponentName: phase.monsterName || phase.name || "SIEGE MONSTER",
                autoText: "몬스터 AI 전선 교전을 계산하고 있습니다.",
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
          message.innerHTML = `<small>${out.result === "WIN" ? "FRONTLINE VICTORY" : "DEFEAT · LINE CONTRIBUTION"}</small><strong>${out.result === "WIN" ? "승리" : "패배"}</strong><b>전선 피해 ${fmt(out.damage)}</b><span>기본 기여 ${fmt(out.baseContribution)} · 적용 ${fmt(out.contributionPercent)}% · 적 전투력 ${fmt(out.monsterPower)}${Number(out.monsterDamageReductionPercent) > 0 ? ` · 적 장막 ${fmt(out.monsterDamageReductionPercent)}%` : ""}</span>${out.result === "WIN" ? `<div class="siege-v2-win-reward"><small>1판 승리 보상</small><b>코인 ${fmt(out.winReward?.coin)} · 카드 조각 ${fmt(out.winReward?.shards)}${out.winReward?.items?.length ? ` · ${out.winReward.items.map((item) => `${item.code} ×${fmt(item.quantity)}`).join(" · ")}` : ""}</b></div>` : ""}<button type="button" data-siege-battle-confirm>전황 지휘실로 복귀</button>`;
          renderer.showResult();
          await new Promise((resolve) => {
            const done = () => resolve();
            message.querySelector("[data-siege-battle-confirm]")?.addEventListener("click", done, { once: true });
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
      overlay.querySelector(".ms3-theater")?.classList.add("impact");
      setTimeout(() => overlay?.querySelector(".ms3-theater")?.classList.remove("impact"), 700);
      if (out.phaseCleared)
        alert(out.eventCleared ? "심연의 성주를 격파했습니다. 연합 공성 승리!" : "몬스터 전선이 붕괴했습니다. 다음 교전 단계로 진격합니다.");
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
    const rallyOpen = event.rallyOpen === true && serverTimestamp(event.rallyEndsAt) > serverClockNow(),
      mainClock = overlay.querySelector("[data-ms-clock]"),
      aiClock = overlay.querySelector(".ms3-ai-clock strong"),
      effectClock = overlay.querySelector("[data-ms-effect-clock]"),
      energyTimer = overlay.querySelector("[data-ms-energy-timer]");
    if (mainClock) mainClock.textContent = clock(rallyOpen ? event.rallyEndsAt : event.endsAt);
    if (aiClock && !rallyOpen) aiClock.textContent = `다음 공격 ${clock(data.ai?.nextActionAt)}`;
    if (effectClock) effectClock.textContent = clock(data.ai?.currentEffect?.endsAt);
    if (energyTimer && data.mine) {
      const energy = Number(data.mine.energy || 0),
        max = Number(data.mine.maxEnergy || 5);
      energyTimer.textContent = energy >= max ? "충전 완료" : `다음 충전 ${rechargeClock(data.mine.nextRechargeAt)}`;
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
    overlay.className = `ms-overlay ms3-overlay${(() => {
      try {
        return window.self !== window.top ? " is-wago" : "";
      } catch {
        return " is-wago";
      }
    })()}`;
    overlay.innerHTML = '<div class="ms-loading">몬스터 AI 전황을 불러오는 중...</div>';
    document.body.appendChild(overlay);
    try {
      await load();
      timer = setInterval(tick, 1000);
    } catch (error) {
      overlay.innerHTML = `<main class="ms3-shell ms3-empty"><header class="ms3-header"><div><small>SIEGE CONNECTION LOST</small><h1>공성전 진입 실패</h1></div><button data-ms-close>×</button></header><section><b>전황 정보를 불러오지 못했습니다.</b><span>${esc(error.message)}</span></section></main>`;
      bind();
    }
  }
  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener("load", inject);
  addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay && !document.querySelector(".ms3-operation-briefing")) close();
  });
  inject();
  globalThis.openMonsterSiege = open;
})();
