// Shared, public-only contract. Never put account IDs, tokens or LIVE guesses here.
export const STREAMER_SETTINGS_KEY = 'streamer_lounge_v2036';
export const STREAMER_LIMIT = 40;
const names = [['qpqpro', '디임'], ['zalalz', '조은'], ['jkmjkm1236', '하이희야'], ['kuyol', '강구열'], ['imducko3o', '오리꿍']];
export const DEFAULT_STREAMER_SETTINGS = Object.freeze({
  enabled: true,
  profiles: Object.freeze(names.map(([id, name]) => Object.freeze({
    id, name, stationUrl: `https://www.sooplive.com/station/${id}`,
    // These exact profile URLs were verified on the five supplied stations.
    imageUrl: `https://stimg.sooplive.com/LOGO/${id.slice(0, 2)}/${id}/m/${id}.webp`,
    description: '', visible: true
  })))
});

export function stationUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https:\/\//i.test(raw) || /[\\\s]/.test(raw)) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['www.sooplive.com', 'sooplive.com'].includes(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash
      || !/^\/station\/[a-zA-Z0-9_-]{2,50}\/?$/.test(url.pathname)) return '';
    return `https://www.sooplive.com${url.pathname.replace(/\/$/, '')}`;
  } catch { return ''; }
}

export function profileImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > 500 || /[\\\u0000-\u0020\u007f]/.test(raw)) return '';
  const local = raw.startsWith('/assets/') || raw.startsWith('assets/');
  if (!local && !/^https:\/\//i.test(raw)) return '';
  try {
    const url = new URL(local ? '/' + raw.replace(/^\//, '') : raw, 'https://cnine-card.pages.dev');
    const decoded = decodeURIComponent(url.pathname);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
      || /[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.split('/').includes('..')
      || !/\.(png|jpe?g|webp|avif)$/i.test(decoded)) return '';
    if (local && !decoded.startsWith('/assets/')) return '';
    return local ? `${url.pathname}${url.search}` : url.href;
  } catch { return ''; }
}

const cleanText = value => String(value ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
export function validateStreamerSettings(input) {
  if (!input || typeof input.enabled !== 'boolean' || !Array.isArray(input.profiles)) throw new Error('운영 상태와 스트리머 목록을 확인하세요.');
  if (input.profiles.length > STREAMER_LIMIT) throw new Error(`최대 ${STREAMER_LIMIT}명까지 등록할 수 있습니다.`);
  const ids = new Set(), stations = new Set();
  const profiles = input.profiles.map((row, index) => {
    const label = `${index + 1}번 스트리머`, id = String(row?.id || ''), name = cleanText(row?.name), description = cleanText(row?.description);
    const station = stationUrl(row?.stationUrl), image = profileImageUrl(row?.imageUrl);
    if (!/^[a-zA-Z0-9_-]{2,60}$/.test(id) || ids.has(id)) throw new Error(`${label}: 등록 ID가 올바르지 않거나 중복됩니다.`);
    if (!name || Array.from(name).length > 30) throw new Error(`${label}: 이름은 1~30자로 입력하세요.`);
    if (Array.from(description).length > 160) throw new Error(`${label}: 소개는 160자 이하로 입력하세요.`);
    if (!station || stations.has(station.toLowerCase())) throw new Error(`${label}: 중복되지 않는 SOOP 방송국 주소를 입력하세요.`);
    if (String(row?.imageUrl || '').trim() && !image) throw new Error(`${label}: 사진은 /assets/ 경로 또는 HTTPS 이미지(PNG·JPG·WebP·AVIF) 주소를 입력하세요.`);
    if (typeof row.visible !== 'boolean') throw new Error(`${label}: 노출 여부를 확인하세요.`);
    ids.add(id); stations.add(station.toLowerCase());
    return { id, name, stationUrl: station, imageUrl: image, description, visible: row.visible };
  });
  return { enabled: input.enabled, profiles };
}

export function publicStreamerSettings(settings) {
  const clean = validateStreamerSettings(settings);
  return { enabled: clean.enabled, profiles: clean.enabled ? clean.profiles.filter(row => row.visible).map(({ visible, ...row }) => row) : [] };
}
