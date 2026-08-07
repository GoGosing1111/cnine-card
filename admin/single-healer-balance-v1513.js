(() => {
  const $ = (selector) => document.querySelector(selector);
  const token = () => localStorage.getItem("cnine_admin_token") || "";
  async function api(options = {}) {
    const response = await fetch("/api/admin/battle/single-healer", {
      ...options,
      headers: { "content-type": "application/json", authorization: `Bearer ${token()}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "단일 힐러 설정 요청 실패");
    return data;
  }
  function mount() {
    const view = $("#view-battle");
    if (!view || $("#singleHealerBalancePanel")) return;
    const panel = document.createElement("div");
    panel.id = "singleHealerBalancePanel";
    panel.className = "panel";
    panel.innerHTML = `<div class="maintenanceHead"><div><small>SINGLE HEALER META BALANCE</small><h2>단일 힐러 · 생명 연결</h2><p>HP형 카드가 정확히 1장일 때만 아군 전체 HP와 능동 회복을 부여합니다. 2장 이상은 기존 중복 페널티가 적용됩니다.</p></div><button id="singleHealerReload" class="ghost">새로고침</button></div><div class="formgrid"><label class="field"><span>단일 힐러 보너스</span><select id="singleHealerEnabled"><option value="1">사용</option><option value="0">중지</option></select></label><label class="field"><span>아군 전체 HP 증가(%)</span><input id="singleHealerTeamHp" type="number" min="0" max="50" step="0.1"></label><label class="field"><span>일반 회복(%)</span><input id="singleHealerHeal" type="number" min="0" max="50" step="0.1"></label><label class="field"><span>위기 HP 기준(%)</span><input id="singleHealerCrisisThreshold" type="number" min="1" max="99" step="0.1"></label><label class="field"><span>위기 회복(%)</span><input id="singleHealerCrisisHeal" type="number" min="0" max="80" step="0.1"></label><label class="field"><span>PVP 최대 회복 횟수</span><input id="singleHealerPvpMax" type="number" min="0" max="20"></label><label class="field"><span>PVE 최대 회복 횟수</span><input id="singleHealerPveMax" type="number" min="0" max="30"></label></div><div class="inlineNotice">기본 상향값: 전체 HP +8% · 일반 회복 10% · HP 40% 이하 위기 회복 16% · PVP 4회 · PVE 6회</div><button id="singleHealerSave">단일 힐러 밸런스 저장</button>`;
    view.querySelector(".panel")?.after(panel);
    $("#singleHealerReload").onclick = load;
    $("#singleHealerSave").onclick = save;
    load().catch((error) => alert(error.message));
  }
  async function load() {
    const config = (await api()).singleHealerBonus || {};
    $("#singleHealerEnabled").value = config.enabled === false ? "0" : "1";
    $("#singleHealerTeamHp").value = config.teamHpPercent ?? 8;
    $("#singleHealerHeal").value = config.healPercent ?? 10;
    $("#singleHealerCrisisThreshold").value = config.crisisThresholdPercent ?? 40;
    $("#singleHealerCrisisHeal").value = config.crisisHealPercent ?? 16;
    $("#singleHealerPvpMax").value = config.pvpMaxActivations ?? 4;
    $("#singleHealerPveMax").value = config.pveMaxActivations ?? 6;
  }
  async function save() {
    const button = $("#singleHealerSave");
    button.disabled = true;
    try {
      const singleHealerBonus = {
        enabled: $("#singleHealerEnabled").value === "1",
        teamHpPercent: Number($("#singleHealerTeamHp").value),
        healPercent: Number($("#singleHealerHeal").value),
        crisisThresholdPercent: Number($("#singleHealerCrisisThreshold").value),
        crisisHealPercent: Number($("#singleHealerCrisisHeal").value),
        pvpMaxActivations: Number($("#singleHealerPvpMax").value),
        pveMaxActivations: Number($("#singleHealerPveMax").value),
      };
      const saved = await api({ method: "PATCH", body: JSON.stringify({ singleHealerBonus }) });
      await load();
      alert(`단일 힐러 밸런스가 저장되었습니다.\n전체 HP +${saved.singleHealerBonus.teamHpPercent}% · 일반 ${saved.singleHealerBonus.healPercent}% · 위기 ${saved.singleHealerBonus.crisisHealPercent}%`);
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  }
  addEventListener("load", mount);
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
})();
