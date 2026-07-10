const app = document.getElementById("app");

function shell(content, wide = false) {
  return `<div class="shell ${wide ? "wide" : ""}"><section class="panel">${content}</section></div>`;
}

function brand(subtitle = "카드를 수집하고 도감을 완성하세요.") {
  return `
    <div class="brand">
      <div class="stars">★★★★★</div>
      <h1>CNINE Card</h1>
      <p>${subtitle}</p>
    </div>
  `;
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

function cardArt(card, locked = false) {
  if (locked) {
    return `<div class="card-art image-slot locked-art"><span>?</span><small>LOCKED</small></div>`;
  }
  return `
    <div class="card-art image-slot">
      <div class="image-glow"></div>
      <span class="art-emoji">${card.emoji || "🎴"}</span>
      <small>${card.imageLabel || card.name}</small>
    </div>
  `;
}

function cardHTML(card, extraClass = "", locked = false) {
  if (locked) {
    return `
      <article class="result-card card-locked ${extraClass}">
        <div class="card-top"><span>${card.no}</span><span class="grade-badge">${card.grade}</span></div>
        ${cardArt(card, true)}
        <div class="card-text">
          <div class="card-name unknown">????</div>
          <div class="card-type">미획득 카드</div>
        </div>
        <div class="card-stars">${getStars(card.grade)}</div>
      </article>
    `;
  }

  return `
    <article class="result-card grade-${card.grade} ${extraClass}">
      <div class="card-shine"></div>
      <div class="card-top"><span>${card.no}</span><span class="grade-badge">${card.grade}</span></div>
      ${cardArt(card)}
      <div class="card-text">
        <div class="card-name">${card.name}</div>
        <div class="card-type">${card.type} · ${card.series}</div>
      </div>
      <div class="card-stars">${getStars(card.grade)}</div>
    </article>
  `;
}

function renderLogin() {
  app.innerHTML = shell(`
    ${brand("첫 시작 시 개인키가 자동 발급됩니다.")}
    <div class="field">
      <label>와이고수 닉네임</label>
      <input id="nickname" type="text" maxlength="16" placeholder="닉네임을 입력하세요" />
    </div>
    <button class="btn" id="startBtn">처음 시작하기</button>
    <div class="divider"></div>
    <div class="field">
      <label>개인키 로그인</label>
      <input id="userKey" type="text" placeholder="CN-XXXX-XXXX-XXXX" />
    </div>
    <button class="btn sub" id="loginBtn">개인키로 로그인</button>
    <div class="note">개인키는 브라우저에 자동 저장됩니다.<br>분실 시 관리자에게 문의하세요.</div>
  `);

  document.getElementById("startBtn").onclick = () => {
    const nickname = document.getElementById("nickname").value.trim();
    if (!nickname) return toast("닉네임을 입력해주세요.");
    const user = createUser(nickname);
    saveUser(user);
    renderCreated(user);
  };

  document.getElementById("loginBtn").onclick = () => {
    const key = document.getElementById("userKey").value.trim();
    const user = getSavedUser();
    if (!key) return toast("개인키를 입력해주세요.");
    if (!user || user.key !== key) return toast("저장된 개인키와 일치하지 않습니다.");
    renderHome(user);
  };
}

function renderCreated(user) {
  app.innerHTML = shell(`
    ${brand("개인키가 발급되었습니다.")}
    <div class="field"><label>닉네임</label><input value="${user.nickname}" readonly /></div>
    <div class="field"><label>개인키</label><input id="copyKey" value="${user.key}" readonly /></div>
    <button class="btn" id="copyBtn">개인키 복사</button>
    <button class="btn sub" id="goHomeBtn">시작하기</button>
    <div class="note">이 브라우저에 자동 저장되었습니다.<br>브라우저 데이터를 삭제하면 다시 입력해야 합니다.<br>분실 시 관리자에게 문의하세요.</div>
  `);
  document.getElementById("copyBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(user.key); toast("개인키가 복사되었습니다."); }
    catch { toast("복사 실패. 직접 복사해주세요."); }
  };
  document.getElementById("goHomeBtn").onclick = () => renderHome(user);
}

function renderHome(user) {
  const unique = getUniqueCount(user);
  const total = CARD_MASTER.length;
  const rate = getCollectionRate(user);
  const totalDraw = (user.cards || []).length;

  app.innerHTML = shell(`
    <div class="topbar">
      <div class="userbox"><strong>${user.nickname}</strong><span>Season 1 · CNINE START</span></div>
      <div class="point-pill"><span>POINT</span><b>${user.point.toLocaleString()}</b></div>
    </div>

    <div class="home-hero">
      <div class="collection-card">
        <div class="meter" style="--rate:${rate * 3.6}deg"><b>${rate}%</b><span>도감</span></div>
        <div>
          <h2>${unique}/${total}</h2>
          <p>수집 완료</p>
          <small>총 뽑기 ${totalDraw.toLocaleString()}회</small>
        </div>
      </div>
    </div>

    ${brand("카드팩을 터치해서 뽑기를 시작하세요.")}

    <div class="pack-area">
      <button class="card-pack" id="packBtn" aria-label="카드팩 열기">
        <div class="pack-ribbon">S1</div>
        <div class="pack-icon">🎴</div>
        <div class="pack-title">CARD PACK</div>
        <div class="pack-sub">1회 100P</div>
      </button>
    </div>

    <button class="btn" id="drawBtn">무료 뽑기</button>
    <div class="menu-grid">
      <button class="btn sub" id="dexBtn">도감</button>
      <button class="btn sub" id="infoBtn">내 정보</button>
    </div>
  `);

  const startDraw = () => startDrawAnimation(user);
  document.getElementById("packBtn").onclick = startDraw;
  document.getElementById("drawBtn").onclick = startDraw;
  document.getElementById("dexBtn").onclick = () => renderDex(user);
  document.getElementById("infoBtn").onclick = () => renderInfo(user);
}

function startDrawAnimation(user) {
  if (user.point < 100) return toast("포인트가 부족합니다.");

  const card = drawCard();
  const isNew = !hasCard(user, card.id);

  user.point -= 100;
  user.cards.push({ cardId: card.id, obtainedAt: new Date().toISOString(), isNewAtDraw: isNew });
  saveUser(user);

  app.innerHTML = shell(`
    <div class="draw-stage">
      <div class="draw-light" id="drawLight"></div>
      <button class="card-pack pack-shake" id="drawPack">
        <div class="pack-ribbon">OPEN</div>
        <div class="pack-icon">🎴</div>
        <div class="pack-title">OPENING</div>
        <div class="pack-sub">빛이 새어 나옵니다</div>
      </button>
      <div class="opening-text">팩을 개봉하는 중...</div>
    </div>
  `);

  setTimeout(() => document.getElementById("drawLight")?.classList.add("light-burst"), 620);
  setTimeout(() => {
    if (["SSR", "LR"].includes(card.grade)) {
      const flash = document.createElement("div");
      flash.className = "flash-screen";
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 760);
    }
    renderDrawResult(user, card, isNew);
  }, 1450);
}

function renderDrawResult(user, card, isNew) {
  const statusClass = isNew ? "new" : "owned";
  const statusText = isNew ? "NEW! 도감에 등록되었습니다." : "이미 보유 중인 카드입니다.";
  const title = isNew ? `${card.grade} 신규 카드 획득!` : `${card.grade} 카드 획득`;

  app.innerHTML = shell(`
    ${brand(title)}
    <div class="draw-stage result-stage">
      ${cardHTML(card, "flip-in")}
      <div class="result-status ${statusClass}">${statusText}</div>
    </div>
    <button class="btn" id="okBtn">확인</button>
    <button class="btn sub" id="againBtn">한 번 더 뽑기</button>
    <button class="btn sub" id="dexBtn">도감 보기</button>
  `);

  document.getElementById("okBtn").onclick = () => renderHome(user);
  document.getElementById("againBtn").onclick = () => startDrawAnimation(user);
  document.getElementById("dexBtn").onclick = () => renderDex(user);
}

function renderDex(user) {
  const owned = new Set((user.cards || []).map(c => c.cardId));
  const groups = [...new Set(CARD_MASTER.map(card => card.name))];
  app.innerHTML = shell(`
    ${brand(`도감 ${owned.size}/${CARD_MASTER.length} · ${getCollectionRate(user)}%`)}
    <div class="dex-toolbar">
      <span>획득 카드는 컬러, 미획득 카드는 실루엣으로 표시됩니다.</span>
    </div>
    <div class="dex-album">
      ${groups.map(name => {
        const cards = CARD_MASTER.filter(card => card.name === name);
        const count = cards.filter(card => owned.has(card.id)).length;
        return `
          <section class="dex-group">
            <div class="dex-group-head">
              <strong>${name}</strong>
              <span>${count}/${cards.length}</span>
            </div>
            <div class="dex-grid">
              ${cards.map(card => {
                const isOwned = owned.has(card.id);
                return `
                  <button class="dex-card ${isOwned ? "owned" : "locked"} grade-border-${card.grade}" data-card-id="${card.id}">
                    <div class="dex-card-no">${card.no}</div>
                    <div class="dex-card-art image-slot ${isOwned ? "" : "locked-art"}">
                      <span>${isOwned ? (card.emoji || "🎴") : "?"}</span>
                      <small>${isOwned ? (card.imageLabel || card.name) : "LOCKED"}</small>
                    </div>
                    <div class="dex-card-name">${isOwned ? card.name : "????"}</div>
                    <div class="dex-card-type">${isOwned ? card.type : "미획득"}</div>
                    <div class="dex-card-grade">${card.grade}</div>
                  </button>
                `;
              }).join("")}
            </div>
          </section>
        `;
      }).join("")}
    </div>
    <button class="btn sub" id="homeBtn">메인으로</button>
  `, true);

  document.querySelectorAll(".dex-card").forEach(btn => {
    btn.onclick = () => {
      const card = CARD_MASTER.find(item => item.id === btn.dataset.cardId);
      renderCardDetail(user, card, owned.has(card.id));
    };
  });
  document.getElementById("homeBtn").onclick = () => renderHome(user);
}

function renderCardDetail(user, card, isOwned) {
  app.innerHTML = shell(`
    ${brand(isOwned ? "카드 상세" : "미획득 카드")}
    <div class="detail-wrap">
      ${cardHTML(card, "pop", !isOwned)}
    </div>
    <div class="info-list">
      <div><span>카드번호</span><b>${card.no}</b></div>
      <div><span>등급</span><b>${card.grade}</b></div>
      <div><span>시리즈</span><b>${isOwned ? card.type : "????"}</b></div>
      <div><span>시즌</span><b>${card.series}</b></div>
      <div><span>획득일</span><b>${isOwned ? formatDate(getFirstObtainedAt(user, card.id)) : "미획득"}</b></div>
    </div>
    <button class="btn sub" id="backBtn">도감으로</button>
  `);
  document.getElementById("backBtn").onclick = () => renderDex(user);
}

function renderInfo(user) {
  const totalDraw = (user.cards || []).length;
  const unique = getUniqueCount(user);
  const duplicates = Math.max(0, totalDraw - unique);
  app.innerHTML = shell(`
    ${brand("내 정보")}
    <div class="field"><label>닉네임</label><input value="${user.nickname}" readonly /></div>
    <div class="field"><label>개인키</label><input id="copyKey" value="${user.key}" readonly /></div>
    <div class="info-list">
      <div><span>총 뽑기</span><b>${totalDraw.toLocaleString()}회</b></div>
      <div><span>도감</span><b>${unique}/${CARD_MASTER.length}</b></div>
      <div><span>완성률</span><b>${getCollectionRate(user)}%</b></div>
      <div><span>중복 기록</span><b>${duplicates.toLocaleString()}회</b></div>
      <div><span>보유 포인트</span><b>${user.point.toLocaleString()}P</b></div>
    </div>
    <button class="btn" id="copyBtn">개인키 복사</button>
    <button class="btn sub" id="homeBtn">메인으로</button>
    <button class="btn ghost" id="resetBtn">테스트용 초기화</button>
  `);
  document.getElementById("copyBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(user.key); toast("개인키가 복사되었습니다."); }
    catch { toast("복사 실패. 직접 복사해주세요."); }
  };
  document.getElementById("homeBtn").onclick = () => renderHome(user);
  document.getElementById("resetBtn").onclick = () => {
    if (confirm("테스트 데이터를 초기화할까요?")) { clearUser(); renderLogin(); }
  };
}
