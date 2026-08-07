(() => {
  const $ = (selector) => document.querySelector(selector);
  function mount() {
    const dialog = $("#userDialog");
    if (!dialog || $("#masterStarAdjustBlock")) return;
    const shardBlock = [...dialog.querySelectorAll(".actionBlock")].find((block) => block.querySelector("h3")?.textContent.includes("카드 조각"));
    if (!shardBlock) return;
    shardBlock.insertAdjacentHTML("afterend", `<div class="actionBlock" id="masterStarAdjustBlock"><h3>마스터의 별 조정</h3><p class="muted">양수는 지급, 음수는 회수되며 모든 변경은 관리자 감사 로그에 기록됩니다.</p><div class="two"><input id="masterStarAmount" type="number" step="1" placeholder="지급은 +, 회수는 -"><input id="masterStarReason" maxlength="100" value="관리자 마스터의 별 조정" placeholder="처리 사유"></div><button type="button" id="masterStarAdjustBtn">마스터의 별 지급/회수</button></div>`);
    $("#masterStarAdjustBtn").onclick = adjust;
  }
  async function adjust() {
    const userId = Number($("#selectedUserId")?.value || 0);
    const amount = Number($("#masterStarAmount")?.value || 0);
    const reason = String($("#masterStarReason")?.value || "").trim();
    if (!userId) return alert("유저를 다시 선택하세요.");
    if (!Number.isInteger(amount) || amount === 0) return alert("지급 또는 회수할 마스터의 별 수량을 정수로 입력하세요.");
    if (!reason) return alert("처리 사유를 입력하세요.");
    if (!confirm(`마스터의 별을 ${amount > 0 ? `${amount.toLocaleString()}개 지급` : `${Math.abs(amount).toLocaleString()}개 회수`}할까요?`)) return;
    const button = $("#masterStarAdjustBtn");
    button.disabled = true;
    try {
      const response = await fetch("/api/admin/users/master-star", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${localStorage.getItem("cnine_admin_token") || ""}` },
        body: JSON.stringify({ userId, amount, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "마스터의 별 조정 실패");
      alert(`처리 완료\n현재 보유 마스터의 별 ${Number(data.balance || 0).toLocaleString()}개`);
      $("#userDialog")?.close();
      if (typeof window.loadUsers === "function") await window.loadUsers();
    } catch (error) { alert(error.message); }
    finally { button.disabled = false; }
  }
  addEventListener("load", mount);
  new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
