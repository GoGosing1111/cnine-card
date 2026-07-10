function generateKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `CN-${part()}-${part()}-${part()}`;
}

function createUser(nickname) {
  return {
    nickname,
    key: generateKey(),
    point: 3000,
    cards: [],
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };
}
