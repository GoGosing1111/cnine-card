// Shared display rules. Mutations and the combat result remain server-owned.
export const FACTION_RULES = Object.freeze({
  protectionMs: 2 * 3600000, squadCooldownMs: 10 * 60000, targetCooldownMs: 30 * 60000,
  strikeCooldownMs: 60000, battleDurationMs: 30 * 60000, sharedHp: 1000000,
  taxPerHour: 1000000000, squadSize: 5, strikeMaxFraction: 0.15,
});
// Request-time cutover: old, uncollected seasons must not be repriced retroactively.
export const FACTION_TAX_CHANGE = Object.freeze({at: Date.parse('2026-09-17T12:50:00Z'), previousPerHour: 1000000});
export const FACTION_TAX_CHANGES = Object.freeze([
  FACTION_TAX_CHANGE,
  Object.freeze({at: Date.parse('2026-09-19T15:06:32Z'), previousPerHour: 50000000}),
]);
export const SQUADS = Object.freeze([
  { id: 'attack1', name: '제1 공격대', role: 'ATTACK' },
  { id: 'attack2', name: '제2 공격대', role: 'ATTACK' },
  { id: 'defense1', name: '제1 방어대', role: 'DEFENSE' },
  { id: 'defense2', name: '제2 방어대', role: 'DEFENSE' },
]);
export const DISTRICTS = Object.freeze([
  ['11110','종로구','광화문 · 종로'], ['11140','중구','명동 · 을지로'],
  ['11170','용산구','한남 · 이태원'], ['11200','성동구','성수 · 왕십리'],
  ['11215','광진구','건대 · 구의'], ['11230','동대문구','청량리 · 회기'],
  ['11260','중랑구','상봉 · 면목'], ['11290','성북구','성신여대 · 길음'],
  ['11305','강북구','수유 · 미아'], ['11320','도봉구','창동 · 방학'],
  ['11350','노원구','노원 · 공릉'], ['11380','은평구','연신내 · 불광'],
  ['11410','서대문구','신촌 · 홍제'], ['11440','마포구','홍대 · 합정'],
  ['11470','양천구','목동 · 신정'], ['11500','강서구','마곡 · 발산'],
  ['11530','구로구','구로 · 신도림'], ['11545','금천구','가산 · 독산'],
  ['11560','영등포구','여의도 · 영등포'], ['11590','동작구','노량진 · 사당'],
  ['11620','관악구','신림 · 서울대입구'], ['11650','서초구','반포 · 서초'],
  ['11680','강남구','강남 · 압구정'], ['11710','송파구','잠실 · 문정'],
  ['11740','강동구','천호 · 고덕'],
].map(([id,name,market]) => Object.freeze({id,name,market})));
export const districtById = id => DISTRICTS.find(d => d.id === String(id));
