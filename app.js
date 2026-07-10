const app = document.getElementById("app");

const STORAGE_KEY = "cnine_card_user";

const CARD_MASTER = [
  { id: "S1-001", name: "철구", type: "기본", grade: "N" },
  { id: "S1-002", name: "철구", type: "정장", grade: "SR" },
  { id: "S1-003", name: "철구", type: "레전드", grade: "LR" },

  { id: "S1-004", name: "남수댕", type: "기본", grade: "N" },
  { id: "S1-005", name: "남수댕", type: "응원", grade: "SR" },
  { id: "S1-006", name: "남수댕", type: "스페셜", grade: "SSR" },

  { id: "S1-007", name: "모리", type: "기본", grade: "N" },
  { id: "S1-008", name: "모리", type: "교복", grade: "R" },
  { id: "S1-009", name: "모리", type: "스페셜", grade: "SSR" },

  { id: "S1-010", name: "오조은", type: "기본", grade: "N" },
  { id: "S1-011", name: "오조은", type: "응원", grade: "R" },
  { id: "S1-012", name: "오조은", type: "스페셜", grade: "SSR" },

  { id: "S1-013", name: "오리꿍", type: "기본", grade: "N" },
  { id: "S1-014", name: "오리꿍", type: "교복", grade: "R" },
  { id: "S1-015", name: "오리꿍", type: "스페셜", grade: "SSR" },

  { id: "S1-016", name: "허로아", type: "기본", grade: "N" },
  { id: "S1-017", name: "허로아", type: "응원", grade: "R" },
  { id: "S1-018", name: "허로아", type: "스페셜", grade: "SSR" }
];

const GRADE_RATE = [
  { grade: "LR", rate: 1 },
  { grade: "SSR", rate: 6 },
  { grade: "SR", rate: 13 },
  { grade: "R", rate: 30 },
  { grade: "N", rate: 50 }
];

function generateKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  return `CN-${part()}-${part()}-${part()}`;
}

function saveUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function getSavedUser() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;

  try {
    const user = JSON.parse(saved);
    if (!Array.isArray(user.cards)) user.cards = [];
    if (typeof user.point !== "number") user.point = 1000;
    return user;
  } catch {
    return null;
  }
}

function pickGrade() {
  const roll = Math.random() * 100;
  let sum = 0;

  for (const item of GRADE_RATE) {
    sum += item.rate;
    if (roll < sum) return item.grade;
  }

  return "N";
}

function drawCard() {
  const grade = pickGrade();
  const pool = CARD_MASTER.filter(card => card.grade === grade);
  return pool[Math.floor(Math.random() * pool.length)];
}

function getStars(grade) {
  const map = {
    N: "★",
    R: "★★",
    SR: "★★★",
    SSR: "★★★★",
    LR: "★★★★★"
  };

  return map[grade] || "★";
}

function getOwnedUniqueCount(user) {
  return new Set(user.cards.map(card => card.cardId)).size;
}

function renderLogin() {
  app.innerHTML = `
    <div class="card-box">
      <div class="logo">
        <h1>CNINE Card</h1>
        <p>카드를 수집하고 도감을 완성하세요.</p>
      </div>

      <div class="input-group">
        <label>와이고수 닉네임</label>
        <input id="nickname" type="text" placeholder="닉네임을 입력하세요">
      </div>

      <button class="btn" id="startBtn">처음 시작하기</button>

      <div class="divider"></div>

      <div class="input-group">
        <label>개인키 로그인</label>
        <input id="userKey" type="text" placeholder="CN-XXXX-XXXX-XXXX">
      </div>

      <button class="btn sub" id="loginBtn">개인키로 로그인</button>

      <div class="notice">
        개인키는 브라우저에 자동 저장됩니다.<br>
        분실 시 관리자에게 문의하세요.
      </div>
    </div>
  `;

  document.getElementById("startBtn").onclick = () => {
    const nickname = document.getElementById("nickname").value.trim();

    if (!nickname) {
      alert("닉네임을 입력해주세요.");
      return;
    }

    const user = {
      nickname,
      key: generateKey(),
      point: 1000,
      cards: [],
      createdAt: new Date().toISOString()
    };

    saveUser(user);
    renderCreated(user);
  };

  document.getElementById("loginBtn").onclick = () => {
    const key = document.getElementById("userKey").value.trim();

    if (!key) {
      alert("개인키를 입력해주세요.");
      return;
    }

    const user = getSavedUser();

    if (!user || user.key !== key) {
      alert("저장된 개인키와 일치하지 않습니다. 분실 시 관리자에게 문의하세요.");
      return;
    }

    renderHome(user);
  };
}

function renderCreated(user) {
  app.innerHTML = `
    <div class="card-box">
      <div class="logo">
        <h1>생성 완료</h1>
        <p>개인키가 발급되었습니다.</p>
      </div>

      <div class="input-group">
        <label>닉네임</label>
        <input type="text" value="${user.nickname}" readonly>
      </div>

      <div class="input-group">
        <label>개인키</label>
        <input id="copyKey" type="text" value="${user.key}" readonly>
      </div>

      <button class="btn" id="copyBtn">개인키 복사</button>
      <button class="btn sub" id="goHomeBtn">시작하기</button>

      <div class="notice">
        이 브라우저에 자동 저장되었습니다.<br>
        브라우저 데이터를 삭제하면 다시 입력해야 합니다.<br>
        분실 시 관리자에게 문의하세요.
      </div>
    </div>
  `;

  document.getElementById("copyBtn").onclick = async () => {
    await navigator.clipboard.writeText(user.key);
    alert("개인키가 복사되었습니다.");
  };

  document.getElementById("goHomeBtn").onclick = () => {
    renderHome(user);
  };
}

function renderHome(user) {
  app.innerHTML = `
    <div class="card-box">
      <div class="logo">
        <h1>CNINE Card</h1>
        <p>${user.nickname}님 환영합니다.</p>
      </div>

      <div class="point-box">
        보유 포인트
        <b>${user.point.toLocaleString()}</b>
      </div>

      <button class="btn" id="drawBtn">무료 뽑기 -100P</button>
      <button class="btn sub" id="dexBtn">도감 ${getOwnedUniqueCount(user)} / ${CARD_MASTER.length}</button>
      <button class="btn sub" id="rankBtn">랭킹</button>
      <button class="btn sub" id="infoBtn">내 정보</button>
    </div>
  `;

  document.getElementById("drawBtn").onclick = () => {
    if (user.point < 100) {
      alert("포인트가 부족합니다.");
      return;
    }

    const card = drawCard();

    user.point -= 100;
    user.cards.push({
      cardId: card.id,
      obtainedAt: new Date().toISOString()
    });

    saveUser(user);
    renderDrawResult(user, card);
  };

  document.getElementById("dexBtn").onclick = () => renderDex(user);
  document.getElementById("rankBtn").onclick = () => alert("랭킹은 DB 연결 후 적용합니다.");
  document.getElementById("infoBtn").onclick = () => renderMyInfo(user);
}

function renderDrawResult(user, card) {
  app.innerHTML = `
    <div class="card-box">
      <div class="logo">
        <h1>${card.grade}</h1>
        <p>카드를 획득했습니다.</p>
      </div>

      <div class="game-card grade-${card.grade}">
        <div class="no">${card.id}</div>
        <div class="name">${card.name}</div>
        <div class="type">${card.type}</div>
        <div class="stars">${getStars(card.grade)}</div>
      </div>

      <button class="btn" id="againBtn">한 번 더 뽑기</button>
      <button class="btn sub" id="homeBtn">메인으로</button>
    </div>
  `;

  document.getElementById("againBtn").onclick = () => {
    renderHome(user);
    document.getElementById("drawBtn").click();
  };

  document.getElementById("homeBtn").onclick = () => renderHome(user);
}

function renderDex(user) {
  const ownedIds = new Set(user.cards.map(card => card.cardId));

  app.innerHTML = `
    <div class="card-box">
      <div class="logo">
        <h1>도감</h1>
        <p>${getOwnedUniqueCount(user)} / ${CARD_MASTER.length}</p>
      </div>

      <div class="grid-list">
        ${CARD_MASTER.map(card => `
          <div class="mini-card ${ownedIds.has(card.id) ? "" : "locked"}">
            <span>${card.id} · ${card.grade}</span>
            <b>${ownedIds.has(card.id) ? card.name : "???"}</b>
            <span>${ownedIds.has(card.id) ? card.type : "미획득"}</span>
          </div>
        `).join("")}
      </div>

      <button class="btn sub" id="homeBtn">메인으로</button>
    </div>
  `;

  document.getElementById("homeBtn").onclick = () => renderHome(user);
}

function renderMyInfo(user) {
  app.innerHTML = `
    <div class="card-box">
      <div class="logo">
        <h1>내 정보</h1>
        <p>${user.nickname}</p>
      </div>

      <div class="input-group">
        <label>닉네임</label>
        <input type="text" value="${user.nickname}" readonly>
      </div>

      <div class="input-group">
        <label>개인키</label>
        <input id="copyKey" type="text" value="${user.key}" readonly>
      </div>

      <div class="notice" style="font-size:14px; margin-bottom:16px;">
        보유 카드 ${user.cards.length}장<br>
        도감 ${getOwnedUniqueCount(user)} / ${CARD_MASTER.length}
      </div>

      <button class="btn" id="copyBtn">개인키 복사</button>
      <button class="btn sub" id="resetBtn">로그아웃/초기화</button>
      <button class="btn sub" id="homeBtn">메인으로</button>
    </div>
  `;

  document.getElementById("copyBtn").onclick = async () => {
    await navigator.clipboard.writeText(user.key);
    alert("개인키가 복사되었습니다.");
  };

  document.getElementById("resetBtn").onclick = () => {
    if (!confirm("현재 브라우저 저장 데이터를 삭제할까요?")) return;
    localStorage.removeItem(STORAGE_KEY);
    renderLogin();
  };

  document.getElementById("homeBtn").onclick = () => renderHome(user);
}

const savedUser = getSavedUser();

if (savedUser) {
  renderHome(savedUser);
} else {
  renderLogin();
}
