const CARD_MASTER = [
  { id: "S1-001", no: "No.001", name: "철구", type: "기본", series: "Season 1", grade: "N", emoji: "👑", imageLabel: "CHULGOO" },
  { id: "S1-002", no: "No.002", name: "철구", type: "정장", series: "Season 1", grade: "SR", emoji: "👑", imageLabel: "SUIT" },
  { id: "S1-003", no: "No.003", name: "철구", type: "레전드", series: "Season 1", grade: "LR", emoji: "👑", imageLabel: "LEGEND" },

  { id: "S1-004", no: "No.004", name: "남수댕", type: "기본", series: "Season 1", grade: "N", emoji: "💙", imageLabel: "NAMSUDANG" },
  { id: "S1-005", no: "No.005", name: "남수댕", type: "응원", series: "Season 1", grade: "SR", emoji: "💙", imageLabel: "CHEER" },
  { id: "S1-006", no: "No.006", name: "남수댕", type: "스페셜", series: "Season 1", grade: "SSR", emoji: "💙", imageLabel: "SPECIAL" },

  { id: "S1-007", no: "No.007", name: "모리", type: "기본", series: "Season 1", grade: "N", emoji: "🌙", imageLabel: "MORI" },
  { id: "S1-008", no: "No.008", name: "모리", type: "교복", series: "Season 1", grade: "R", emoji: "🌙", imageLabel: "SCHOOL" },
  { id: "S1-009", no: "No.009", name: "모리", type: "스페셜", series: "Season 1", grade: "SSR", emoji: "🌙", imageLabel: "SPECIAL" },

  { id: "S1-010", no: "No.010", name: "오조은", type: "기본", series: "Season 1", grade: "N", emoji: "✨", imageLabel: "OJOEUN" },
  { id: "S1-011", no: "No.011", name: "오조은", type: "응원", series: "Season 1", grade: "R", emoji: "✨", imageLabel: "CHEER" },
  { id: "S1-012", no: "No.012", name: "오조은", type: "스페셜", series: "Season 1", grade: "SSR", emoji: "✨", imageLabel: "SPECIAL" },

  { id: "S1-013", no: "No.013", name: "오리꿍", type: "기본", series: "Season 1", grade: "N", emoji: "🦆", imageLabel: "ORIKKUNG" },
  { id: "S1-014", no: "No.014", name: "오리꿍", type: "교복", series: "Season 1", grade: "R", emoji: "🦆", imageLabel: "SCHOOL" },
  { id: "S1-015", no: "No.015", name: "오리꿍", type: "스페셜", series: "Season 1", grade: "SSR", emoji: "🦆", imageLabel: "SPECIAL" },

  { id: "S1-016", no: "No.016", name: "허로아", type: "기본", series: "Season 1", grade: "N", emoji: "🌸", imageLabel: "HUROA" },
  { id: "S1-017", no: "No.017", name: "허로아", type: "응원", series: "Season 1", grade: "R", emoji: "🌸", imageLabel: "CHEER" },
  { id: "S1-018", no: "No.018", name: "허로아", type: "스페셜", series: "Season 1", grade: "SSR", emoji: "🌸", imageLabel: "SPECIAL" }
];

const GRADE_RATE = [
  { grade: "LR", rate: 1 },
  { grade: "SSR", rate: 6 },
  { grade: "SR", rate: 13 },
  { grade: "R", rate: 30 },
  { grade: "N", rate: 50 }
];

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
  return { N: "★", R: "★★", SR: "★★★", SSR: "★★★★", LR: "★★★★★" }[grade] || "★";
}

function getUniqueCount(user) {
  return new Set((user.cards || []).map(c => c.cardId)).size;
}

function hasCard(user, cardId) {
  return (user.cards || []).some(c => c.cardId === cardId);
}

function getFirstObtainedAt(user, cardId) {
  const found = (user.cards || []).find(c => c.cardId === cardId);
  return found ? found.obtainedAt : null;
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

function getCollectionRate(user) {
  return Math.round((getUniqueCount(user) / CARD_MASTER.length) * 1000) / 10;
}
