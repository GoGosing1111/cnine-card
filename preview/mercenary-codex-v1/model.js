// Shared read-only codex model. The preparation roster owns all facts; no legacy ranks.
export const ROSTER_URL = new URL('../../assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json?v=2062.1-four-looks', import.meta.url);
export const ASSET_ROOT = new URL('../../', import.meta.url);
export const MEDIA_PREFIX = 'assets/ui/project-v/mercenaries/codex-v1/';
export const POSITIONS = ['전위', '중거리', '후열'];
export const SORTS = ['code', 'newest', 'name', 'position'];
export const ENTRY = Object.freeze({ id: 'mercenaryDex', title: '용병도감', group: 'collection', previewOnly: true });
const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const collator = new Intl.Collator('ko', { numeric: true });

export function assetUrl(path) {
  if (typeof path !== 'string' || !/^assets\/[a-zA-Z0-9_./-]+$/.test(path) || path.includes('..')) throw new Error('허용되지 않은 리소스 경로입니다.');
  return new URL(path, ASSET_ROOT).href;
}
export function mediaPath(code, kind = 'art', size = 320) {
  if (!/^V-\d{3}$/.test(code) || !['art', 'sd'].includes(kind) || ![320, 640].includes(size)) throw new Error('잘못된 미리보기 리소스입니다.');
  return `${MEDIA_PREFIX}${code.toLowerCase()}-${kind}-${size}.webp`;
}
export const positionOf = card => String(card.role).split(' ')[0];
export const roleOf = card => String(card.role).split(' ').slice(1).join(' ');
export function normalizeQuery(value) {
  return String(value || '').normalize('NFC').toLocaleLowerCase('ko').replace(/[\s\-_]/g, '');
}
export function initials(value) {
  return [...String(value)].map(ch => {
    const point = ch.charCodeAt(0) - 0xAC00;
    return point >= 0 && point <= 11171 ? INITIALS[Math.floor(point / 588)] : ch;
  }).join('');
}
export function queryMatches(card, query) {
  const q = normalizeQuery(query);
  if (!q) return true;
  const haystack = normalizeQuery([card.code, card.name, card.title, card.role, card.weapon || '', card.outfit || ''].join(' '));
  return haystack.includes(q) || (/^[ㄱ-ㅎ]+$/.test(q) && initials(haystack).includes(q));
}
export function filterCards(cards, state = {}, favorites = new Set()) {
  const result = cards.filter(card => queryMatches(card, state.q)
    && (!state.position || state.position === positionOf(card))
    && (!state.role || state.role === roleOf(card))
    && (!state.favoritesOnly || favorites.has(card.code)));
  return result.sort((a, b) => {
    if (state.sort === 'newest') return collator.compare(b.code, a.code);
    if (state.sort === 'name') return collator.compare(a.name, b.name) || collator.compare(a.code, b.code);
    if (state.sort === 'position') return POSITIONS.indexOf(positionOf(a)) - POSITIONS.indexOf(positionOf(b)) || collator.compare(a.code, b.code);
    return collator.compare(a.code, b.code);
  });
}
export function validateRoster(roster) {
  if (roster?.format !== 'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1' || !Array.isArray(roster.cards) || !roster.cards.length) throw new Error('용병 명단 형식을 확인해 주세요.');
  const seen = new Set();
  for (const card of roster.cards) {
    if (!/^V-\d{3}$/.test(card.code) || seen.has(card.code) || !card.name || !card.title || !POSITIONS.includes(positionOf(card))) throw new Error('용병 기본 정보가 올바르지 않습니다.');
    assetUrl(card.sourceArt);
    if (card.battleSprite) assetUrl(card.battleSprite);
    seen.add(card.code);
  }
  assetUrl(roster.cardComposition.frame);
  return roster;
}
export function summarize(cards) {
  return {
    total: cards.length,
    sourceReady: cards.filter(card => card.sourceArt).length,
    spriteReady: cards.filter(card => card.battleSprite).length,
    rankPending: cards.filter(card => card.rank == null).length,
    positions: Object.fromEntries(POSITIONS.map(position => [position, cards.filter(card => positionOf(card) === position).length]))
  };
}
export function collectionEntries(navigation) {
  const group = navigation?.groups?.collection;
  if (!group) throw new Error('도감·강화 메뉴 정보를 찾지 못했습니다.');
  const entries = Array.from(group.routes).filter(id => id !== ENTRY.id).map(id => ({ id, ...navigation.routes[id] }));
  entries.splice(1, 0, ENTRY);
  return entries;
}
export function readState(url, cards) {
  const params = new URL(url).searchParams;
  const roles = new Set(cards.map(roleOf));
  return {
    q: (params.get('q') || '').slice(0, 80),
    position: POSITIONS.includes(params.get('position')) ? params.get('position') : '',
    role: roles.has(params.get('role')) ? params.get('role') : '',
    sort: SORTS.includes(params.get('sort')) ? params.get('sort') : 'code',
    favoritesOnly: params.get('saved') === '1'
  };
}
export function artStatus(card) {
  if (card.sourceArtStatus === 'APPROVED_SOURCE_ART') return '승인 원화';
  if (card.sourceArtStatus === 'USER_SUPPLIED_SOURCE_ART') return '사용자 지정 원본';
  return '기존 로스터 원화';
}
export function sdStatus(card) {
  if (!card.battleSprite) return '제작 대기';
  return card.battleSpriteStatus?.includes('USER_REVIEW_PENDING') ? '기술검수 완료 · 시각검수 대기' : '기술검수 완료';
}
