(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const token = () =>
    localStorage.getItem("cnine_admin_token") ||
    sessionStorage.getItem("cnine_admin_token") ||
    "";
  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const format = (value) => Math.round(number(value)).toLocaleString("ko-KR");
  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );

  let last = null;
  let dirty = false;

  async function api(path, options = {}) {
    const response = await fetch(`/api/${path}`, {
      ...options,
      cache: "no-store",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token()}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
    return data;
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
          quantity: Math.max(1, number(quantity, 1)),
        };
      })
      .filter((item) => item.code);

  function numberField({
    id,
    label,
    value,
    min = 0,
    max = 2000000000,
    step = 1,
    hint = "",
    className = "",
  }) {
    return `<label class="msa-field ${className}"><span>${escapeHtml(label)}</span><input id="${id}" data-msa-number type="number" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}">${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</label>`;
  }

  function textField({ id, label, value, hint = "", className = "" }) {
    return `<label class="msa-field ${className}"><span>${escapeHtml(label)}</span><input id="${id}" value="${escapeHtml(value)}">${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</label>`;
  }

  function renderUnitRows(phaseIndex, formationType, units, powers) {
    const label = formationType === "Defense" ? "방어대" : "돌격대";
    return `<div class="msa-unit-group"><header><div><small>${formationType.toUpperCase()} FORCE</small><h4>${label} 개별 전투력</h4></div><span>${formationType === "Defense" ? "유저 PVE 전투 상대" : "AI 진영 피해에 반영"}</span></header><div class="msa-unit-list">${units
      .map(
        (unit, unitIndex) => `<label class="msa-unit-row"><img src="${escapeHtml(unit.image)}" alt=""><span><b>${escapeHtml(unit.name)}</b><small>${escapeHtml(unit.role)}</small></span><input id="msaPhase${phaseIndex}${formationType}Power${unitIndex}" data-msa-number type="number" min="1" max="2000000000" step="100" value="${escapeHtml(powers[unitIndex])}" aria-label="${escapeHtml(unit.name)} 전투력"></label>`,
      )
      .join("")}</div></div>`;
  }

  function renderPhase(phase, phaseIndex, catalog, currentPhaseIndex) {
    const defense = catalog?.defense || [];
    const assault = catalog?.assault || [];
    const ai = phase.ai || {};
    return `<details class="msa-phase" data-phase-index="${phaseIndex}" ${phaseIndex === currentPhaseIndex || (!last?.state?.event && phaseIndex === 0) ? "open" : ""}>
      <summary><span class="msa-phase-number">${String(phaseIndex + 1).padStart(2, "0")}</span><div><small>${escapeHtml(phase.key)} FRONT</small><b>${escapeHtml(phase.name)}</b></div><div class="msa-phase-summary"><span>연합 ${format(phase.allianceHp)}</span><span>몬스터 ${format(phase.hp)}</span><span>기준 전투력 ${format(phase.battlePower)}</span></div></summary>
      <div class="msa-phase-body">
        <div class="msa-phase-heading"><div><small>FRONTLINE IDENTITY</small><h3>거점·진영 체력</h3></div><div class="msa-phase-forecast" data-phase-forecast="${phaseIndex}">예상값 계산 중</div></div>
        <div class="msa-grid four">
          ${textField({ id: `msaPhaseName${phaseIndex}`, label: "전선 이름", value: phase.name })}
          ${textField({ id: `msaPhaseSubtitle${phaseIndex}`, label: "작전 설명", value: phase.subtitle })}
          ${numberField({ id: `msaPhaseAllianceHp${phaseIndex}`, label: "숲켓몬 연합 진영 HP", value: phase.allianceHp, min: 100000, step: 10000, hint: "이 전선 진입·후퇴 시 적용" })}
          ${numberField({ id: `msaPhaseMonsterHp${phaseIndex}`, label: "몬스터 군단 진영 HP", value: phase.hp, min: 1000, step: 10000, hint: "방어대 개인 HP가 아닌 전선 HP" })}
          ${numberField({ id: `msaPhaseBasePower${phaseIndex}`, label: "전선 기준 전투력", value: phase.battlePower, min: 1, step: 100, hint: "돌격대 피해 환산 기준" })}
          ${numberField({ id: `msaPhaseDamageMultiplier${phaseIndex}`, label: "유저 공성 피해 보정 (%)", value: phase.damageMultiplierPercent, min: 10, max: 500, hint: "전선별 난이도 보정" })}
        </div>
        <div class="msa-formation-grid">
          ${renderUnitRows(phaseIndex, "Defense", defense, phase.defensePowers)}
          ${renderUnitRows(phaseIndex, "Assault", assault, phase.assaultPowers)}
        </div>
        <div class="msa-phase-heading compact"><div><small>AUTONOMOUS OPERATION</small><h3>돌격대 AI 세부 수치</h3></div><p>돌격대 전투력 ÷ 전선 기준 전투력이 실제 진영 피해에 추가 반영됩니다.</p></div>
        <div class="msa-grid six">
          ${numberField({ id: `msaPhaseAiAttack${phaseIndex}`, label: "기본 공격 (% 진영 HP)", value: ai.attackPercent, min: 0.01, max: 10, step: 0.01, hint: "AI 1회 기본 피해율" })}
          ${numberField({ id: `msaPhaseAiSkillEvery${phaseIndex}`, label: "작전 스킬 주기 (회)", value: ai.skillEvery, min: 2, max: 100, hint: "N번째 행동마다 발동" })}
          ${numberField({ id: `msaPhaseAiSkillMultiplier${phaseIndex}`, label: "스킬 피해 배율", value: ai.skillMultiplier, min: 0.1, max: 20, step: 0.05, hint: "기본 공격 대비 배율" })}
          ${numberField({ id: `msaPhaseAiHeal${phaseIndex}`, label: "스킬 진영 회복 (%)", value: ai.healPercent, min: 0, max: 100, step: 0.1, hint: "몬스터 진영 HP 회복" })}
          ${numberField({ id: `msaPhaseAiShield${phaseIndex}`, label: "공성 피해 감소 (%)", value: ai.shieldPercent, min: 0, max: 90, hint: "유저 공성 피해 감소" })}
          ${numberField({ id: `msaPhaseAiShieldSeconds${phaseIndex}`, label: "피해 감소 지속 (초)", value: ai.shieldSeconds, min: 0, max: 3600, hint: "0이면 효과 없음" })}
        </div>
      </div>
    </details>`;
  }

  function metric(label, value, caption, tone = "") {
    return `<article class="msa-metric ${tone}"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b><span>${escapeHtml(caption)}</span></article>`;
  }

  function render(data) {
    last = data;
    dirty = false;
    const cfg = data.settings;
    const event = data.state?.event;
    const campaign = data.state?.campaign;
    const stage = !event ? "IDLE" : event.stage === "RALLY" ? "RALLY" : "BATTLE";
    const currentPhaseIndex = event ? number(event.phaseIndex) : -1;
    const root = $("#msaRoot");
    const metrics = event
      ? [
          metric("운영 상태", stage === "RALLY" ? "편성 대기" : "전투 진행", event.endsAt || "-", stage === "RALLY" ? "warn" : "live"),
          metric("현재 전선", campaign?.currentFront?.name || `전선 ${currentPhaseIndex + 1}`, `${currentPhaseIndex + 1} / ${cfg.phases.length}`),
          metric("연합 진영 체력", `${format(campaign?.factions?.alliance?.hp)} / ${format(campaign?.factions?.alliance?.maxHp)}`, `${number(campaign?.factions?.alliance?.percent).toFixed(1)}%`, "alliance"),
          metric("몬스터 진영 체력", `${format(campaign?.factions?.monster?.hp)} / ${format(campaign?.factions?.monster?.maxHp)}`, `${number(campaign?.factions?.monster?.percent).toFixed(1)}%`, "monster"),
        ]
      : [
          metric("운영 모드", cfg.mode, "진행 회차 없음", cfg.mode === "ON" ? "live" : ""),
          metric("전투 시간", `${number(cfg.durationMinutes) / 60}시간`, `집결 ${cfg.rallyMinutes}분`),
          metric("예상 유저 전투력", format(cfg.expectedPlayerPower), "피해 시뮬레이션 기준", "alliance"),
          metric("AI 공격 주기", `${cfg.monsterAttackIntervalSeconds}초`, `공통 배율 ${cfg.monsterAttackPowerPercent}%`, "monster"),
        ];

    root.innerHTML = `<div class="msa-shell">
      <section class="msa-command-head"><div><small>MONSTER SIEGE · TERRITORY FRONTLINE CMS</small><h2>${event ? `${escapeHtml(event.name)} 운영 중` : "몬스터공성 통합 밸런스 센터"}</h2><p>진영 체력, 유저 공성 피해, 방어대·돌격대 개별 전투력과 AI 작전 수치를 실제 서버 계산에 연결합니다.</p></div><div class="msa-head-actions"><span id="msaSaveState" class="msa-state">설정 동기화 완료</span><button type="button" class="ghost" id="msaReload">새로고침</button></div></section>
      <div class="msa-metrics">${metrics.join("")}</div>
      <nav class="msa-jump"><button type="button" data-target="msaOperation">운영</button><button type="button" data-target="msaDamage">공성 피해</button><button type="button" data-target="msaFronts">전선·전투력</button><button type="button" data-target="msaRewards">보상</button></nav>

      <section class="msa-card" id="msaOperation"><div class="msa-card-head"><div><small>OPERATION CONTROL</small><h3>회차 운영·AI 공통 설정</h3><p>진행 중 저장하면 시간과 현재 전선의 최대 체력을 비율 보존 방식으로 즉시 갱신합니다.</p></div><span class="msa-mode ${cfg.mode.toLowerCase()}">${cfg.mode}</span></div>
        <div class="msa-grid four">
          <label class="msa-field"><span>운영 모드</span><select id="msaMode"><option value="OFF" ${cfg.mode === "OFF" ? "selected" : ""}>OFF · 중지</option><option value="TEST" ${cfg.mode === "TEST" ? "selected" : ""}>TEST · 관리자만</option><option value="ON" ${cfg.mode === "ON" ? "selected" : ""}>ON · 전체 공개</option></select><small>TEST는 OWNER·ADMIN만 접근</small></label>
          ${textField({ id: "msaName", label: "공성전 이름", value: cfg.name })}
          ${numberField({ id: "msaRally", label: "집결 시간 (분)", value: cfg.rallyMinutes, min: 1, max: 1440, hint: "종료 후 신규 참가 차단" })}
          ${numberField({ id: "msaDuration", label: "전투 진행 시간 (분)", value: cfg.durationMinutes, min: 30, max: 10080, hint: `${(cfg.durationMinutes / 60).toFixed(1)}시간` })}
          ${numberField({ id: "msaCooldown", label: "유저 공격 재사용 (초)", value: cfg.attackCooldownSeconds, min: 2, max: 300 })}
          <label class="msa-field"><span>몬스터 AI</span><select id="msaAiEnabled"><option value="ON" ${cfg.monsterAiEnabled !== false ? "selected" : ""}>ON · 자율 공세</option><option value="OFF" ${cfg.monsterAiEnabled === false ? "selected" : ""}>OFF · 정지</option></select><small>돌격대만 연합 진영 공격</small></label>
          ${numberField({ id: "msaAiInterval", label: "AI 행동 간격 (초)", value: cfg.monsterAttackIntervalSeconds, min: 15, max: 300, hint: "접속 공백 행동도 일괄 반영" })}
          ${numberField({ id: "msaAiPower", label: "AI 공격력 공통 배율 (%)", value: cfg.monsterAttackPowerPercent, min: 10, max: 500, hint: "모든 전선 돌격대에 적용" })}
        </div>
      </section>

      <section class="msa-card" id="msaDamage"><div class="msa-card-head"><div><small>PLAYER SIEGE DAMAGE</small><h3>유저 공성 피해 공식</h3><p>전투 승패, 전선 보정, 난수 편차, 최소·최대 제한과 몬스터 피해 감소를 순서대로 적용합니다.</p></div><div id="msaDamagePreview" class="msa-formula-preview"></div></div>
        <div class="msa-formula">유저 PVE 전투력 × 기본 계수 × 승패 기여율 × 전선 보정 × 편차 → 최소·최대 제한 → 몬스터 피해 감소</div>
        <div class="msa-grid six">
          ${numberField({ id: "msaExpectedPower", label: "예상 평균 PVE 전투력", value: cfg.expectedPlayerPower, min: 1, hint: "미리보기 전용" })}
          ${numberField({ id: "msaSiegeDamage", label: "기본 피해 계수 (%)", value: cfg.siegeDamagePercent, min: 1, max: 1000 })}
          ${numberField({ id: "msaWinContribution", label: "승리 기여율 (%)", value: cfg.winContributionPercent, min: 1, max: 300 })}
          ${numberField({ id: "msaDefeatContribution", label: "패배 기여율 (%)", value: cfg.defeatContributionPercent, min: 0, max: 100 })}
          ${numberField({ id: "msaDamageMin", label: "1회 최소 공성 피해", value: cfg.siegeDamageMin, min: 1, step: 100 })}
          ${numberField({ id: "msaDamageMax", label: "1회 최대 공성 피해", value: cfg.siegeDamageMax, min: 1, step: 100 })}
          ${numberField({ id: "msaDamageVariance", label: "피해 편차 (±%)", value: cfg.siegeDamageVariancePercent, min: 0, max: 50, hint: "요청번호 기반 결정형 편차" })}
        </div>
      </section>

      <section id="msaFronts"><div class="msa-section-title"><div><small>FIVE TERRITORY FRONTS</small><h2>전선별 진영 체력·개별 전투력·AI</h2><p>방어대는 실제 유저 전투 상대, 돌격대는 지도 이동과 연합 진영 피해의 주체입니다.</p></div><button type="button" class="ghost" id="msaExpandAll">전선 전체 펼치기</button></div>
        <div class="msa-front-list">${cfg.phases
          .map((phase, phaseIndex) =>
            renderPhase(
              phase,
              phaseIndex,
              data.formationCatalog?.[phaseIndex],
              currentPhaseIndex,
            ),
          )
          .join("")}</div>
      </section>

      <section class="msa-card" id="msaRewards"><div class="msa-card-head"><div><small>REWARD CONTROL</small><h3>전투·최종 정산 보상</h3><p>아이템은 ITEM_CODE:수량 형식으로 입력하며 서버 활성 아이템만 저장됩니다.</p></div></div>
        <div class="msa-grid four">
          ${numberField({ id: "msaWinCoin", label: "1판 승리 코인", value: cfg.perBattleWinCoin, min: 0 })}
          ${numberField({ id: "msaWinShards", label: "1판 승리 카드 조각", value: cfg.perBattleWinShards, min: 0 })}
          ${textField({ id: "msaWinItems", label: "1판 승리 아이템", value: rewardItemsText(cfg.perBattleWinItems), hint: "예: PREMIUM_CUBE:1" })}
          ${numberField({ id: "msaMin", label: "최종 정산 최소 공격", value: cfg.minAttacks, min: 1, max: 1000 })}
          ${numberField({ id: "msaCoin", label: "성공 정산 코인", value: cfg.rewardCoin, min: 0 })}
          ${numberField({ id: "msaShards", label: "성공 정산 카드 조각", value: cfg.rewardShards, min: 0 })}
          ${textField({ id: "msaFinalItems", label: "성공 정산 아이템", value: rewardItemsText(cfg.finalRewardItems), hint: "실패 정산에는 아이템 미지급", className: "wide" })}
        </div>
      </section>

      <div class="msa-savebar"><div><b id="msaDirtyLabel">서버 설정과 동일합니다.</b><span>저장 전 모든 범위와 피해 상한을 검사합니다.</span></div><div class="msa-save-actions"><button id="msaStart" ${stage === "IDLE" ? "" : "hidden"}>편성대기 시작 · ${cfg.rallyMinutes}분</button><button id="msaBeginBattle" class="warn" ${stage === "RALLY" ? "" : "hidden"}>편성 마감 · 전투 시작</button><button id="msaSuccess" class="warn" ${stage === "BATTLE" ? "" : "hidden"}>성공 종료</button><button id="msaFail" class="danger" ${stage === "BATTLE" ? "" : "hidden"}>실패 종료</button><button id="msaSave">전체 설정 저장</button></div></div>
    </div>`;

    bindControls();
    refreshForecast();
  }

  function readNumber(id, fallback = 0) {
    return number($(`#${id}`)?.value, fallback);
  }

  function clampPreview(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function refreshForecast() {
    if (!last) return;
    const expectedPower = readNumber("msaExpectedPower", last.settings.expectedPlayerPower);
    const damageScale = readNumber("msaSiegeDamage", last.settings.siegeDamagePercent);
    const winPercent = readNumber("msaWinContribution", last.settings.winContributionPercent);
    const losePercent = readNumber("msaDefeatContribution", last.settings.defeatContributionPercent);
    const minimum = readNumber("msaDamageMin", last.settings.siegeDamageMin);
    const maximum = Math.max(minimum, readNumber("msaDamageMax", last.settings.siegeDamageMax));
    const variance = readNumber("msaDamageVariance", last.settings.siegeDamageVariancePercent);
    const aiInterval = readNumber("msaAiInterval", last.settings.monsterAttackIntervalSeconds);
    const aiGlobal = readNumber("msaAiPower", last.settings.monsterAttackPowerPercent);
    const base = (expectedPower * damageScale) / 100;
    const globalPreview = $("#msaDamagePreview");
    if (globalPreview) {
      const win = clampPreview((base * winPercent) / 100, minimum, maximum);
      const lose = losePercent <= 0 ? 0 : clampPreview((base * losePercent) / 100, minimum, maximum);
      globalPreview.innerHTML = `<small>전투력 ${format(expectedPower)} 기준</small><b>승리 ${format(win)} · 패배 ${format(lose)}</b><span>편차 ±${format(variance)}% 적용 전</span>`;
    }
    last.settings.phases.forEach((phase, phaseIndex) => {
      const phaseHp = readNumber(`msaPhaseMonsterHp${phaseIndex}`, phase.hp);
      const allianceHp = readNumber(`msaPhaseAllianceHp${phaseIndex}`, phase.allianceHp);
      const phaseMultiplier = readNumber(
        `msaPhaseDamageMultiplier${phaseIndex}`,
        phase.damageMultiplierPercent,
      );
      const phaseBasePower = Math.max(
        1,
        readNumber(`msaPhaseBasePower${phaseIndex}`, phase.battlePower),
      );
      const winDamage = clampPreview(
        base * (winPercent / 100) * (phaseMultiplier / 100),
        minimum,
        maximum,
      );
      const expectedWins = Math.max(1, Math.ceil(phaseHp / Math.max(1, winDamage)));
      const assaultPowers = [0, 1, 2].map((unitIndex) =>
        readNumber(
          `msaPhase${phaseIndex}AssaultPower${unitIndex}`,
          phase.assaultPowers[unitIndex],
        ),
      );
      const averageAssault =
        assaultPowers.reduce((sum, value) => sum + value, 0) / assaultPowers.length;
      const attackPercent = readNumber(
        `msaPhaseAiAttack${phaseIndex}`,
        phase.ai.attackPercent,
      );
      const skillEvery = Math.max(
        2,
        readNumber(`msaPhaseAiSkillEvery${phaseIndex}`, phase.ai.skillEvery),
      );
      const skillMultiplier = readNumber(
        `msaPhaseAiSkillMultiplier${phaseIndex}`,
        phase.ai.skillMultiplier,
      );
      const basicAiDamage =
        allianceHp *
        (attackPercent / 100) *
        (aiGlobal / 100) *
        (averageAssault / phaseBasePower);
      const averageAiDamage =
        (basicAiDamage * (skillEvery - 1) + basicAiDamage * skillMultiplier) /
        skillEvery;
      const collapseMinutes =
        (Math.ceil(allianceHp / Math.max(1, averageAiDamage)) * aiInterval) / 60;
      const target = $(`[data-phase-forecast="${phaseIndex}"]`);
      if (target) {
        target.innerHTML = `<span>예상 승리 피해 <b>${format(winDamage)}</b></span><span>전선 돌파 약 <b>${format(expectedWins)}승</b></span><span>AI 기본 공격 <b>${format(basicAiDamage)}</b></span><span>연합 붕괴 약 <b>${collapseMinutes.toFixed(1)}분</b></span>`;
      }
    });
  }

  function markDirty() {
    if (!dirty) {
      dirty = true;
      const label = $("#msaDirtyLabel");
      if (label) label.textContent = "저장되지 않은 변경사항이 있습니다.";
      setSaveState("수정 대기", "warn");
    }
    refreshForecast();
  }

  function setSaveState(message, tone = "") {
    const state = $("#msaSaveState");
    if (!state) return;
    state.textContent = message;
    state.className = `msa-state ${tone}`.trim();
  }

  function collectSettings() {
    const invalid = $$('[data-msa-number]').find((input) => !input.checkValidity());
    if (invalid) {
      invalid.focus();
      throw new Error(`${invalid.closest("label")?.querySelector("span")?.textContent || "수치"} 범위를 확인하세요.`);
    }
    const minDamage = readNumber("msaDamageMin");
    const maxDamage = readNumber("msaDamageMax");
    if (minDamage > maxDamage) {
      $("#msaDamageMax")?.focus();
      throw new Error("1회 최대 공성 피해는 최소 공성 피해보다 커야 합니다.");
    }
    const phases = last.settings.phases.map((phase, phaseIndex) => ({
      ...phase,
      name: $(`#msaPhaseName${phaseIndex}`).value.trim(),
      subtitle: $(`#msaPhaseSubtitle${phaseIndex}`).value.trim(),
      hp: readNumber(`msaPhaseMonsterHp${phaseIndex}`),
      allianceHp: readNumber(`msaPhaseAllianceHp${phaseIndex}`),
      battlePower: readNumber(`msaPhaseBasePower${phaseIndex}`),
      damageMultiplierPercent: readNumber(`msaPhaseDamageMultiplier${phaseIndex}`),
      defensePowers: [0, 1, 2].map((unitIndex) =>
        readNumber(`msaPhase${phaseIndex}DefensePower${unitIndex}`),
      ),
      assaultPowers: [0, 1, 2].map((unitIndex) =>
        readNumber(`msaPhase${phaseIndex}AssaultPower${unitIndex}`),
      ),
      ai: {
        ...phase.ai,
        attackPercent: readNumber(`msaPhaseAiAttack${phaseIndex}`),
        skillEvery: readNumber(`msaPhaseAiSkillEvery${phaseIndex}`),
        skillMultiplier: readNumber(`msaPhaseAiSkillMultiplier${phaseIndex}`),
        healPercent: readNumber(`msaPhaseAiHeal${phaseIndex}`),
        shieldPercent: readNumber(`msaPhaseAiShield${phaseIndex}`),
        shieldSeconds: readNumber(`msaPhaseAiShieldSeconds${phaseIndex}`),
      },
    }));
    if (phases.some((phase) => !phase.name || !phase.subtitle))
      throw new Error("전선 이름과 작전 설명을 모두 입력하세요.");
    return {
      ...last.settings,
      mode: $("#msaMode").value,
      name: $("#msaName").value.trim(),
      rallyMinutes: readNumber("msaRally"),
      durationMinutes: readNumber("msaDuration"),
      attackCooldownSeconds: readNumber("msaCooldown"),
      monsterAiEnabled: $("#msaAiEnabled").value === "ON",
      monsterAttackIntervalSeconds: readNumber("msaAiInterval"),
      monsterAttackPowerPercent: readNumber("msaAiPower"),
      expectedPlayerPower: readNumber("msaExpectedPower"),
      siegeDamagePercent: readNumber("msaSiegeDamage"),
      winContributionPercent: readNumber("msaWinContribution"),
      defeatContributionPercent: readNumber("msaDefeatContribution"),
      siegeDamageMin: minDamage,
      siegeDamageMax: maxDamage,
      siegeDamageVariancePercent: readNumber("msaDamageVariance"),
      allianceFortressHp: phases[0].allianceHp,
      perBattleWinCoin: readNumber("msaWinCoin"),
      perBattleWinShards: readNumber("msaWinShards"),
      perBattleWinItems: parseRewardItems($("#msaWinItems").value),
      minAttacks: readNumber("msaMin"),
      rewardCoin: readNumber("msaCoin"),
      rewardShards: readNumber("msaShards"),
      finalRewardItems: parseRewardItems($("#msaFinalItems").value),
      phases,
    };
  }

  async function save() {
    const button = $("#msaSave");
    try {
      const body = collectSettings();
      button.disabled = true;
      setSaveState("저장 중", "busy");
      await api("admin/siege/settings", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load();
      setSaveState("저장 완료", "ok");
    } catch (error) {
      setSaveState(error.message, "error");
      alert(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function operate(action, body = {}) {
    if (dirty) {
      alert("변경사항을 먼저 저장한 뒤 작전을 실행하세요.");
      return;
    }
    const messages = {
      start: `${readNumber("msaRally", last.settings.rallyMinutes)}분 편성대기를 시작할까요?`,
      "begin-battle": "편성을 마감하고 지금부터 공성 전투를 시작할까요?",
      success: "현재 공성전을 성공으로 즉시 정산할까요?",
      fail: "현재 공성전을 실패로 즉시 정산할까요?",
    };
    if (!confirm(messages[action])) return;
    const path = action === "success" || action === "fail" ? "finish" : action;
    const payload =
      action === "success"
        ? { success: true }
        : action === "fail"
          ? { success: false }
          : body;
    await api(`admin/siege/${path}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await load();
  }

  function bindControls() {
    $("#msaReload").onclick = load;
    $("#msaSave").onclick = save;
    $("#msaStart").onclick = () => operate("start");
    $("#msaBeginBattle").onclick = () => operate("begin-battle");
    $("#msaSuccess").onclick = () => operate("success");
    $("#msaFail").onclick = () => operate("fail");
    $("#msaExpandAll").onclick = (event) => {
      const phases = $$(".msa-phase");
      const open = phases.some((phase) => !phase.open);
      phases.forEach((phase) => (phase.open = open));
      event.currentTarget.textContent = open ? "전선 전체 접기" : "전선 전체 펼치기";
    };
    $$(".msa-jump button").forEach((button) => {
      button.onclick = () =>
        document.getElementById(button.dataset.target)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    });
    $$("input, select", $("#msaRoot")).forEach((input) => {
      input.addEventListener("input", markDirty);
      input.addEventListener("change", markDirty);
    });
  }

  async function load() {
    const root = $("#msaRoot");
    if (root) root.innerHTML = '<div class="msa-loading">몬스터공성 설정과 전황을 불러오는 중입니다.</div>';
    try {
      render(await api("admin/siege/settings"));
    } catch (error) {
      if (root)
        root.innerHTML = `<div class="msa-error"><b>설정을 불러오지 못했습니다.</b><span>${escapeHtml(error.message)}</span><button type="button" id="msaRetry">다시 시도</button></div>`;
      $("#msaRetry")?.addEventListener("click", load);
    }
  }

  function mount() {
    const nav = $("#nav");
    if (nav && !nav.querySelector('[data-view="monstersiege"]')) {
      const button = document.createElement("button");
      button.dataset.view = "monstersiege";
      button.innerHTML = '몬스터 공성전 <span class="buildBadge">V1890</span>';
      nav.querySelector('[data-view="territorywar"]')?.after(button);
      button.onclick = open;
    }
    const cms = $("#cms");
    if (cms && !$("#view-monstersiege")) {
      const section = document.createElement("section");
      section.className = "view";
      section.id = "view-monstersiege";
      section.hidden = true;
      section.innerHTML = '<div id="msaRoot" class="msa-root"><div class="msa-loading">몬스터공성 CMS를 준비하는 중입니다.</div></div>';
      cms.appendChild(section);
    }
  }

  function open() {
    mount();
    $$(".view").forEach(
      (view) => (view.hidden = view.id !== "view-monstersiege"),
    );
    $$("#nav button").forEach((button) =>
      button.classList.toggle("active", button.dataset.view === "monstersiege"),
    );
    if ($("#pageTitle")) $("#pageTitle").textContent = "몬스터 공성전";
    load();
  }

  addEventListener("load", mount);
  new MutationObserver(mount).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  mount();
})();
