(() => {
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const fmt = (v) => Number(v || 0).toLocaleString("ko-KR");
  let overlay = null,
    data = null,
    timer = null,
    busy = false,
    viewportCleanup = null,
    serverOffset = 0,
    lastServerNow = "";
  const api = (path, options = {}) =>
    globalThis.apiRequest(path, options, {
      ttl: 0,
      timeoutMs: 20000,
      replaceInflight: true,
    });
  const requestId = () => `SIEGE:${crypto?.randomUUID?.() || Date.now()}`;
  function serverTimestamp(value) {
    const raw = String(value || "").trim();
    if (!raw) return NaN;
    return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw);
  }
  function serverClockNow() { return Date.now() + serverOffset; }
  function syncServerClock(payload) {
    const stamp = String(payload?.serverNow || "");
    if (!stamp || stamp === lastServerNow) return;
    const parsed = serverTimestamp(stamp);
    if (Number.isFinite(parsed)) serverOffset = parsed - Date.now();
    lastServerNow = stamp;
  }
  function clock(value) {
    const ms = serverTimestamp(value) - serverClockNow();
    if (ms <= 0) return "00:00:00";
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  function rechargeClock(value) {
    const ms = serverTimestamp(value) - serverClockNow();
    if (ms <= 0) return "충전 확인 중";
    const seconds = Math.ceil(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function inject() {
    document.querySelectorAll("[data-monster-siege-entry]").forEach((entry) => {
      if (!entry.closest(".pve-mode-tabs")) entry.remove();
    });
    const target = document.querySelector(".pve-mode-tabs");
    if (!target || target.querySelector("[data-monster-siege-entry]")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.monsterSiegeEntry = "1";
    b.className = "pve-mode-btn monster-siege-pve-entry";
    b.innerHTML = "<span>몬스터 공성전</span><small>SIEGE</small>";
    b.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    });
    target.appendChild(b);
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
    overlay?.remove();
    overlay = null;
    data = null;
  }
  function phaseTrack() {
    const phases = data.settings.phases,
      current = Number(data.event?.phaseIndex || 0);
    return `<nav class="ms-phase-track">${phases.map((p, i) => `<div class="${i < current ? "done" : i === current ? "active" : ""}"><i>${i < current ? "✓" : i + 1}</i><span>${esc(p.name)}</span><small>PHASE ${i + 1}</small></div>`).join("")}</nav>`;
  }
  function ranking() {
    return `<section class="ms-board"><header><small>ALLIANCE CONTRIBUTION</small><h3>연합 기여도</h3></header><div>${(data.ranking || []).map((x, i) => `<article><b>${i + 1}</b><span>${esc(x.nickname)}<small>${fmt(x.attacks)}회 출전</small></span><strong>${fmt(x.damage)}</strong></article>`).join("") || "<p>첫 공격 기록을 기다리고 있습니다.</p>"}</div></section>`;
  }
  function reward() {
    const r = data.reward;
    if (!r) return "";
    const items = [
      Number(r.coin) > 0 ? { icon: "◈", name: "코인", amount: r.coin } : null,
      Number(r.shards) > 0 ? { icon: "◆", name: "카드 조각", amount: r.shards } : null,
      ...(r.items || []).map((item) => ({ icon: "✦", name: item.code === "VEHICLE_DRAW_TICKET" ? "이동수단 뽑기권" : item.code, amount: item.quantity })),
    ].filter(Boolean);
    return `<section class="ms-reward ms-reward-final"><div class="ms-reward-seal"><i></i><b>VICTORY</b></div><div class="ms-reward-copy"><small>SIEGE FINAL SETTLEMENT</small><h3>연합 공성 보상</h3><p>전선 기여 기록이 확인되었습니다. 아래 보상을 인벤토리로 수령하세요.</p><div class="ms-reward-items">${items.map((item) => `<article><i>${item.icon}</i><span>${esc(item.name)}</span><b>× ${fmt(item.amount)}</b></article>`).join("")}</div></div><button data-ms-claim><span>보상 수령</span><small>인벤토리에 즉시 지급</small></button></section>`;
  }
  function showClaimReceipt(out) {
    const items = [
      Number(out.coin) > 0 ? ["코인", out.coin] : null,
      Number(out.shards) > 0 ? ["카드 조각", out.shards] : null,
      ...(out.items || []).map((item) => [item.code === "VEHICLE_DRAW_TICKET" ? "이동수단 뽑기권" : item.code, item.quantity]),
    ].filter(Boolean);
    const receipt = document.createElement("div");
    receipt.className = "ms-claim-receipt";
    receipt.innerHTML = `<section><div class="ms-claim-burst"><i></i><b>✓</b></div><small>REWARD ACQUIRED</small><h2>공성 보상 수령 완료</h2><p>보상이 인벤토리에 안전하게 지급되었습니다.</p><div>${items.map(([name, amount]) => `<article><span>${esc(name)}</span><b>+${fmt(amount)}</b></article>`).join("")}</div><button type="button">확인</button></section>`;
    overlay.appendChild(receipt);
    receipt.querySelector("button").onclick = () => receipt.remove();
  }
  function render() {
    if (!overlay || !data) return;
    syncServerClock(data);
    const cfg = data.settings,
      event = data.event,
      phase = data.phase,
      mine = data.mine,
      rallyOpen = event?.rallyOpen === true;
    if (!event) {
      overlay.innerHTML = `<main class="ms-shell ms-empty"><button data-ms-close>×</button><div class="ms-moon"></div><h1>몬스터 공성전</h1><p>현재 진행 중인 공성전이 없습니다.</p>${reward()}</main>`;
      bind();
      return;
    }
    const pct = Math.max(0, Math.min(100, Number(phase.percent || 0)));
    overlay.innerHTML = `<main class="ms-shell phase-${String(phase.key).toLowerCase()}"><header class="ms-top"><div><small>SOOPKETMON ALLIANCE SIEGE · ${(Number(cfg.durationMinutes || 0) / 60).toFixed(1)} HOURS</small><h1>${esc(event.name)}</h1><p>${esc(phase.subtitle)}</p></div><div class="ms-clock"><span>공성 종료까지</span><b data-ms-clock>${clock(event.endsAt)}</b></div><button data-ms-close>×</button></header>${phaseTrack()}${reward()}<section class="ms-war-layout"><aside class="ms-orders"><header><small>SIEGE OPERATION</small><h3>연합 작전 현황</h3></header><article><i>⚔</i><span><b>총공격</b><small>모든 유저가 하나의 성채를 공격합니다.</small></span></article><article><i>◈</i><span><b>공성 병기</b><small>단계가 전환될 때마다 전장이 변화합니다.</small></span></article><article><i>✦</i><span><b>전선 기여</b><small>승패와 전투력에 따라 실제 피해가 누적됩니다.</small></span></article><div class="ms-my"><small>MY CONTRIBUTION</small><b>${fmt(mine?.damage || 0)}</b><span>${fmt(mine?.attacks || 0)}회 공격 · PVE 전투력 ${fmt(mine?.deckPower || 0)}</span></div></aside><section class="ms-battlefield"><div class="ms-art" aria-hidden="true"></div><div class="ms-sky"><i></i><i></i><i></i></div><div class="ms-target"><small>PHASE ${Number(phase.index) + 1} · ${esc(phase.key)}</small><h2>${esc(phase.name)}</h2><strong>${fmt(phase.hp)} <em>/ ${fmt(phase.maxHp)}</em></strong><div><i style="width:${pct}%"></i></div><span>${pct.toFixed(1)}%</span></div><button class="ms-attack" data-ms-${mine ? "attack" : "join"} ${busy ? "disabled" : ""}><span>${mine ? "공성 공격" : "공성전 참가"}</span><small>${mine ? "저장된 PVE 덱으로 성채 공격" : "PVE 덱 5장 필요"}</small></button></section>${ranking()}</section></main>`;
    const actionButton = overlay.querySelector(".ms-attack");
    const targetPanel = overlay.querySelector(".ms-target");
    const phaseTrackNode = overlay.querySelector(".ms-phase-track");
    const clockLabel = overlay.querySelector(".ms-clock span");
    const clockValue = overlay.querySelector("[data-ms-clock]");
    if (clockLabel) clockLabel.textContent = rallyOpen ? "집결 종료까지" : "공성 종료까지";
    if (clockValue) clockValue.textContent = clock(rallyOpen ? event.rallyEndsAt : event.endsAt);
    if (rallyOpen && phaseTrackNode) {
      phaseTrackNode.insertAdjacentHTML("afterend", `<section class="ms-rally-status"><div><i></i><span><small>FORMATION REGISTRATION</small><b>${mine ? "집결 신청 완료" : "공성 부대 편성 중"}</b></span></div><strong data-ms-rally-clock>${clock(event.rallyEndsAt)}</strong><p>${mine ? "편성이 등록되었습니다. 집결 종료 후 공격 버튼이 활성화됩니다." : "남은 시간 안에 참가해야 공성 전투에 출전할 수 있습니다."}</p></section>`);
    }
    if (mine && targetPanel) {
      const energy = Math.max(0, Number(mine.energy || 0));
      const maxEnergy = Math.max(1, Number(mine.maxEnergy || 5));
      const energyPanel = document.createElement("section");
      energyPanel.className = "ms-energy";
      energyPanel.innerHTML = `<header><span>공성 출전 횟수</span><b data-ms-energy-count>${energy} / ${maxEnergy}</b></header><div><i data-ms-energy-fill style="width:${Math.min(100, energy / maxEnergy * 100)}%"></i></div><small data-ms-energy-timer>${energy >= maxEnergy ? "충전 완료" : `다음 충전 ${rechargeClock(mine.nextRechargeAt)}`}</small>`;
      targetPanel.appendChild(energyPanel);
      if (!rallyOpen && energy < 1 && actionButton) {
        actionButton.disabled = true;
        actionButton.querySelector("span").textContent = "출전 횟수 충전 중";
        actionButton.querySelector("small").textContent = "5분마다 1회 충전됩니다.";
      }
    }
    if (actionButton && rallyOpen && mine) {
      actionButton.disabled = true;
      actionButton.querySelector("span").textContent = "집결 완료";
      actionButton.querySelector("small").textContent = "집결 종료 후 공격할 수 있습니다.";
    } else if (actionButton && !rallyOpen && !mine) {
      actionButton.disabled = true;
      actionButton.querySelector("span").textContent = "참여 마감";
      actionButton.querySelector("small").textContent = "집결 시간이 종료되었습니다.";
      actionButton.removeAttribute("data-ms-join");
    }
    bind();
  }
  function bind() {
    overlay.querySelector("[data-ms-close]")?.addEventListener("click", close);
    overlay.querySelector("[data-ms-join]")?.addEventListener("click", join);
    overlay
      .querySelector("[data-ms-attack]")
      ?.addEventListener("click", attack);
    overlay.querySelector("[data-ms-claim]")?.addEventListener("click", claim);
  }
  async function load() {
    data = await api("siege/state");
    render();
  }
  async function join() {
    if (busy) return;
    busy = true;
    render();
    try {
      data = await api("siege/join", { method: "POST", body: "{}" });
      render();
    } catch (e) {
      alert(e.message);
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
                opponentName:
                  phase.monsterName || phase.name || "SIEGE MONSTER",
                autoText: "공성전 V2 전투를 계산하고 있습니다.",
              })
            : null;
      modal.classList.add("siege-v2-battle-modal");
      const out = await api("siege/attack", {
        method: "POST",
        body: JSON.stringify({ requestId: requestId() }),
      });
      if (
        out.battleV2 &&
        live &&
        typeof window.playSiegeBattleV2Live === "function"
      ) {
        renderer = await window.playSiegeBattleV2Live({
          stage: live.stage,
          phase: live.phase,
          msg: live.msg,
          modal,
          data: out,
          monster: out.monster,
          playUltimateCinematics: true,
        });
        const msg = modal.querySelector("#battleMessage");
        if (msg) {
          modal.appendChild(msg);
          msg.className =
            "battle-message battle-v2-live-result is-visible siege-v2-result";
          msg.innerHTML = `<small>${out.result === "WIN" ? "FRONTLINE VICTORY" : "DEFEAT · LINE CONTRIBUTION"}</small><strong>${out.result === "WIN" ? "승리" : "패배"}</strong><b>전선 피해 ${fmt(out.damage)}</b><span>기본 기여 ${fmt(out.baseContribution)} · 적용 ${fmt(out.contributionPercent)}% · 적 전투력 ${fmt(out.monsterPower)}</span>${out.result === "WIN" ? `<div class="siege-v2-win-reward"><small>1판 승리 보상</small><b>코인 ${fmt(out.winReward?.coin)} · 카드 조각 ${fmt(out.winReward?.shards)}${out.winReward?.items?.length ? ` · ${out.winReward.items.map((item) => `${item.code} ×${fmt(item.quantity)}`).join(" · ")}` : ""}</b></div>` : ""}<button type="button" data-siege-battle-confirm>공성전으로 돌아가기</button>`;
          renderer.showResult();
          await new Promise((resolve) => {
            const done = () => resolve();
            msg
              .querySelector("[data-siege-battle-confirm]")
              ?.addEventListener("click", done, { once: true });
            modal.addEventListener(
              "click",
              (event) => {
                if (event.target === modal) done();
              },
              { once: true },
            );
          });
        }
      }
      data = out.state;
      renderer?.destroy?.();
      modal.className = "modal";
      modal.innerHTML = "";
      render();
      const shell = overlay.querySelector(".ms-shell");
      shell?.classList.add("impact");
      setTimeout(() => shell?.classList.remove("impact"), 700);
      if (out.phaseCleared)
        alert(
          out.eventCleared
            ? "성주를 격파했습니다! 공성전 승리!"
            : "공략 단계가 전환되었습니다.",
        );
    } catch (e) {
      renderer?.destroy?.();
      if (modal) {
        modal.className = "modal";
        modal.innerHTML = "";
      }
      alert(e.message);
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
    } catch (e) {
      alert(e.message);
    } finally {
      busy = false;
    }
  }
  async function open() {
    if (overlay) return;
    syncViewport();
    overlay = document.createElement("div");
    overlay.className = `ms-overlay${(() => {
      try {
        return window.self !== window.top ? " is-wago" : "";
      } catch {
        return " is-wago";
      }
    })()}`;
    overlay.innerHTML =
      '<div class="ms-loading">성채 전황을 불러오는 중...</div>';
    document.body.appendChild(overlay);
    try {
      await load();
      timer = setInterval(() => {
        const el = overlay?.querySelector("[data-ms-clock]");
        if (el && data?.event) {
          const rallyOpen = data.event.rallyOpen === true && serverTimestamp(data.event.rallyEndsAt) > serverClockNow();
          el.textContent = clock(rallyOpen ? data.event.rallyEndsAt : data.event.endsAt);
          const rallyClock = overlay?.querySelector("[data-ms-rally-clock]");
          if (rallyClock) rallyClock.textContent = clock(data.event.rallyEndsAt);
          if (data.event.rallyOpen === true && !rallyOpen) load().catch(() => {});
        }
        const energyTimer = overlay?.querySelector("[data-ms-energy-timer]");
        if (energyTimer && data?.mine) {
          const energy = Number(data.mine.energy || 0), max = Number(data.mine.maxEnergy || 5);
          if (energy >= max) energyTimer.textContent = "충전 완료";
          else if (serverTimestamp(data.mine.nextRechargeAt) <= serverClockNow()) load().catch(() => {});
          else energyTimer.textContent = `다음 충전 ${rechargeClock(data.mine.nextRechargeAt)}`;
        }
      }, 1000);
    } catch (e) {
      overlay.innerHTML = `<main class="ms-shell ms-empty"><button data-ms-close>×</button><h1>공성전 진입 실패</h1><p>${esc(e.message)}</p></main>`;
      bind();
    }
  }
  new MutationObserver(inject).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  addEventListener("load", inject);
  inject();
  globalThis.openMonsterSiege = open;
})();
