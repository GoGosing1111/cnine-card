(() => {
  const $ = (s) => document.querySelector(s),
    token = () => localStorage.getItem("cnine_admin_token") || "";
  let last = null;
  async function api(path, options = {}) {
    const r = await fetch("/api/" + path, {
        ...options,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token()}`,
          ...(options.headers || {}),
        },
      }),
      d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || "요청 실패");
    return d;
  }
  const rewardItemsText = (items) =>
    (Array.isArray(items) ? items : [])
      .map((item) => `${item.code}:${item.quantity}`)
      .join(", ");
  const parseRewardItems = (value) =>
    String(value || "")
      .split(/[\n,]+/)
      .map((entry) => {
        const [code, quantity] = entry.trim().split(":");
        return {
          code: String(code || "").trim(),
          quantity: Number(quantity || 1),
        };
      })
      .filter((item) => item.code);
  function mount() {
    const nav = $("#nav");
    if (nav && !nav.querySelector('[data-view="monstersiege"]')) {
      const b = document.createElement("button");
      b.dataset.view = "monstersiege";
      b.innerHTML = '몬스터 공성전 <span class="buildBadge">CMS</span>';
      nav.querySelector('[data-view="territorywar"]')?.after(b);
      b.onclick = open;
    }
    const cms = $("#cms");
    if (cms && !$("#view-monstersiege")) {
      const s = document.createElement("section");
      s.className = "view";
      s.id = "view-monstersiege";
      s.hidden = true;
      s.innerHTML = `<div class="sectionIntro"><div><small>ALLIANCE MONSTER SIEGE</small><h2>몬스터 공성전</h2><p>진행 시간·전선 유지력·전투 기여·별도 아이템 보상을 관리합니다.</p></div><button class="ghost" id="msaReload">새로고침</button></div><div id="msaRoot" class="panel">공성전 설정을 불러오는 중입니다.</div>`;
      cms.appendChild(s);
      $("#msaReload").onclick = load;
    }
  }
  function open() {
    mount();
    document
      .querySelectorAll(".view")
      .forEach((x) => (x.hidden = x.id !== "view-monstersiege"));
    document
      .querySelectorAll("#nav button")
      .forEach((x) =>
        x.classList.toggle("active", x.dataset.view === "monstersiege"),
      );
    if ($("#pageTitle")) $("#pageTitle").textContent = "몬스터 공성전";
    load().catch((e) => alert(e.message));
  }
  function render(d) {
    last = d;
    const cfg = d.settings,
      event = d.state?.event,
      benchmark = d.territoryBenchmark || {},
      root = $("#msaRoot");
    const expectedHit = Math.max(
      1,
      Math.floor((cfg.expectedPlayerPower * cfg.siegeDamagePercent) / 100),
    );
    root.innerHTML = `<div class="maintenanceHead"><div><small>CASTLE OPERATION CONTROL</small><h2>${event ? `${event.name} · 진행 중` : "공성전 대기"}</h2><p>${event ? `종료 ${event.endsAt} · 누적 피해 ${Number(event.totalDamage || 0).toLocaleString()}` : "설정을 저장한 뒤 수동 시작할 수 있습니다."}</p>${benchmark.rounds ? `<p>최근 영토전 ${benchmark.rounds}회 평균 · 참가 ${benchmark.averageParticipants}명 · 총 공격 ${benchmark.averageAttacks}회 · 유지 ${benchmark.averageHours}시간</p>` : `<p>완료된 영토전 표본이 없어 기본 예상 전투력으로 판수를 계산합니다.</p>`}</div></div>
      <h3>운영·보상 설정</h3><div class="formgrid"><label class="field"><span>운영 모드</span><select id="msaMode"><option ${cfg.mode === "OFF" ? "selected" : ""}>OFF</option><option ${cfg.mode === "TEST" ? "selected" : ""}>TEST</option><option ${cfg.mode === "ON" ? "selected" : ""}>ON</option></select></label><label class="field"><span>공성전 이름</span><input id="msaName" value="${cfg.name}"></label><label class="field"><span>진행 시간(분)</span><input id="msaDuration" type="number" min="30" max="10080" value="${cfg.durationMinutes}"><small>${(cfg.durationMinutes / 60).toFixed(1)}시간 · 진행 중 저장 시 종료 시각도 갱신</small></label><label class="field"><span>공격 재사용(초)</span><input id="msaCooldown" type="number" min="2" value="${cfg.attackCooldownSeconds}"></label><label class="field"><span>1판 승리 코인</span><input id="msaWinCoin" type="number" min="0" value="${cfg.perBattleWinCoin}"></label><label class="field"><span>1판 승리 카드 조각</span><input id="msaWinShards" type="number" min="0" value="${cfg.perBattleWinShards}"></label><label class="field"><span>1판 승리 아이템</span><input id="msaWinItems" value="${rewardItemsText(cfg.perBattleWinItems)}" placeholder="PREMIUM_CUBE:1, ITEM_CODE:2"><small>아이템코드:수량, 쉼표로 복수 입력</small></label><label class="field"><span>최소 정산 공격 횟수</span><input id="msaMin" type="number" min="1" value="${cfg.minAttacks}"></label><label class="field"><span>최종 성공 보상 코인</span><input id="msaCoin" type="number" min="0" value="${cfg.rewardCoin}"></label><label class="field"><span>최종 성공 보상 카드 조각</span><input id="msaShards" type="number" min="0" value="${cfg.rewardShards}"></label><label class="field"><span>최종 성공 아이템</span><input id="msaFinalItems" value="${rewardItemsText(cfg.finalRewardItems)}" placeholder="PREMIUM_CUBE:1"><small>성공 정산 대상자에게 인벤토리 NEW로 지급</small></label></div>
      <h3>공략 단계 · 몬스터 고정 전투력</h3><div class="formgrid">${cfg.phases.map((p, i) => `<label class="field"><span>${i + 1}. ${p.monsterName}</span><input class="msaPhasePower" data-i="${i}" type="number" min="1" max="2000000000" value="${p.battlePower}"><small>${p.name} · 모든 유저에게 동일한 고정 전투력</small></label>`).join("")}</div>
      <h3>전선 HP · 영토전형 기여 피해</h3><div class="formgrid"><label class="field"><span>승리 기여 배율(%)</span><input id="msaSiegeDamage" type="number" min="1" max="1000" value="${cfg.siegeDamagePercent}"><small>유저 PVE 전투력 × 배율이 승리 전선 피해</small></label><label class="field"><span>패배 기여율(%)</span><input id="msaDefeatContribution" type="number" min="0" max="100" value="${cfg.defeatContributionPercent}"><small>승리 예정 피해의 일부만 전선에 기여</small></label><label class="field"><span>예상 평균 PVE 전투력</span><input id="msaExpectedPower" type="number" min="1" value="${cfg.expectedPlayerPower}"><small>예상 판수 계산 전용이며 실제 승패에는 미사용</small></label>${cfg.phases.map((p, i) => `<label class="field"><span>${i + 1}. ${p.name} HP</span><input class="msaPhaseHp" data-i="${i}" type="number" min="1000" value="${p.hp}"><small>예상 승리 ${Math.ceil(p.hp / expectedHit).toLocaleString()}판 · 패배만이면 ${Math.ceil(p.hp / Math.max(1, Math.floor((expectedHit * cfg.defeatContributionPercent) / 100))).toLocaleString()}판</small></label>`).join("")}</div>
      <div class="bar"><button id="msaSave">설정 저장</button><button id="msaStart" ${event ? "disabled" : ""}>${(cfg.durationMinutes / 60).toFixed(1)}시간 공성전 시작</button><button id="msaSuccess" class="warn" ${event ? "" : "disabled"}>성공 종료</button><button id="msaFail" class="danger" ${event ? "" : "disabled"}>실패 종료</button></div>`;
    const durationInput = $("#msaDuration");
    if (durationInput && !$("#msaRally")) {
      const rallyField = document.createElement("label");
      rallyField.className = "field";
      rallyField.innerHTML = `<span>집결 시간(분)</span><input id="msaRally" type="number" min="1" max="1440" value="${cfg.rallyMinutes}"><small>종료 후 신규 참여 차단 · 이후 전투 시작</small>`;
      durationInput.closest("label")?.before(rallyField);
    }
    $("#msaSave").onclick = save;
    $("#msaStart").onclick = () => operate("start");
    $("#msaSuccess").onclick = () => operate("finish", { success: true });
    $("#msaFail").onclick = () => operate("finish", { success: false });
  }
  async function load() {
    render(await api("admin/siege/settings"));
  }
  async function save() {
    const phases = last.settings.phases.map((p, i) => ({
        ...p,
        hp: Number(document.querySelector(`.msaPhaseHp[data-i="${i}"]`).value),
        battlePower: Number(
          document.querySelector(`.msaPhasePower[data-i="${i}"]`).value,
        ),
      })),
      body = {
        ...last.settings,
        mode: $("#msaMode").value,
        name: $("#msaName").value,
        rallyMinutes: Number($("#msaRally").value),
        durationMinutes: Number($("#msaDuration").value),
        attackCooldownSeconds: Number($("#msaCooldown").value),
        siegeDamagePercent: Number($("#msaSiegeDamage").value),
        defeatContributionPercent: Number($("#msaDefeatContribution").value),
        expectedPlayerPower: Number($("#msaExpectedPower").value),
        perBattleWinCoin: Number($("#msaWinCoin").value),
        perBattleWinShards: Number($("#msaWinShards").value),
        perBattleWinItems: parseRewardItems($("#msaWinItems").value),
        minAttacks: Number($("#msaMin").value),
        rewardCoin: Number($("#msaCoin").value),
        rewardShards: Number($("#msaShards").value),
        finalRewardItems: parseRewardItems($("#msaFinalItems").value),
        phases,
      };
    await api("admin/siege/settings", {
      method: "POST",
      body: JSON.stringify(body),
    });
    await load();
    alert("공성전 설정이 저장되었습니다.");
  }
  async function operate(action, body = {}) {
    if (
      !confirm(
        action === "start"
          ? `${(last.settings.durationMinutes / 60).toFixed(1)}시간 공성전을 지금 시작할까요?`
          : "현재 공성전을 즉시 정산할까요?",
      )
    )
      return;
    await api(`admin/siege/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    await load();
  }
  addEventListener("load", mount);
  new MutationObserver(mount).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  mount();
})();
