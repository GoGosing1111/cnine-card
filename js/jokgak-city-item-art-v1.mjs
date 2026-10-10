// City item art only. Prices, effects, ownership and actions come from city state.
const item = (file, name, tone) => Object.freeze({file, name, tone});
export const CITY_ITEM_ART = Object.freeze({
  LUNCHBOX: item('lunchbox', '휴대 도시락', 'food'),
  VITAMIN: item('vitamin', '비타민 드링크', 'tonic'),
  FIRST_AID: item('first-aid', '응급 처치 키트', 'medical'),
  SET_MEAL: item('set-meal', '든든한 정식', 'food'),
  TREATMENT: item('treatment', '회복 진료', 'medical'),
  PIPE: item('pipe', '쇠파이프', 'steel'),
  PISTOL: item('pistol', '권총', 'steel'),
  RIFLE: item('rifle', '소총', 'olive'),
});

export function cityItemArt(code, compact = false) {
  const art = Object.hasOwn(CITY_ITEM_ART, code) ? CITY_ITEM_ART[code] : null;
  if (!art) return '';
  const base = `/assets/ui/jokgak-city/items-v1/${art.file}`;
  return `<span class="jc-item-art jc-item-art--${art.tone}" data-city-item-art="${code}"><img src="${base}-768.webp" srcset="${base}-256.webp 256w, ${base}-768.webp 768w" sizes="${compact ? '110px' : '(max-width: 800px) 240px, 300px'}" width="768" height="768" alt="${art.name}" decoding="async" draggable="false"></span>`;
}
