(() => {
  const cards = [...document.querySelectorAll(".unit")];
  const dialog = document.querySelector("#detail");
  let current = 0;
  let focusedCard = null;
  const render = index => {
    current = (index + cards.length) % cards.length;
    const card = cards[current];
    const img = card.querySelector("img");
    document.querySelector("#detail-title").textContent = card.dataset.name;
    document.querySelector("#detail-role").textContent = card.dataset.role;
    document.querySelector("#detail-description").textContent = card.dataset.description;
    const detail = document.querySelector("#detail-image");
    detail.src = img.getAttribute("src");
    detail.alt = img.alt;
    document.querySelector("#download").href = img.getAttribute("src");
    document.querySelector("#detail-position").textContent = String(current + 1).padStart(2, "0") + " / 07";
  };
  cards.forEach((card, index) => card.addEventListener("click", () => {
    focusedCard = card; render(index); dialog.showModal();
  }));
  document.querySelector("#previous").addEventListener("click", () => render(current - 1));
  document.querySelector("#next").addEventListener("click", () => render(current + 1));
  document.querySelector("#close-detail").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => focusedCard?.focus());
  dialog.addEventListener("click", event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
  dialog.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") { event.preventDefault(); render(current - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); render(current + 1); }
  });
  document.querySelectorAll("[data-surface-choice]").forEach(button => button.addEventListener("click", () => {
    document.body.dataset.surface = button.dataset.surfaceChoice;
    document.querySelectorAll("[data-surface-choice]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
  }));
  const scale = document.querySelector("#scale-toggle");
  scale.addEventListener("click", () => {
    const enabled = document.body.classList.toggle("battle-scale");
    scale.setAttribute("aria-pressed", String(enabled));
    scale.textContent = enabled ? "크게 보기로 돌아가기" : "전투 크기 · 160px";
  });
})();
