import { TROPHY_CATALOG } from '../../js/player-card-model-v2052.js';
const trophyData = [
  { count: 2, acquiredAt: '2026-08-20T13:00:00Z', progress: 2, goal: 1 },
  { count: 1, acquiredAt: '2026-09-01T13:00:00Z', progress: 3, goal: 3 },
  { count: 1, acquiredAt: '2026-08-25T13:00:00Z', progress: 1, goal: 1 }
];
const profile = {
  version: 2052, player: { id: 0, nickname: '별을걷는사람', title: { badgeText: '챌린저★★★★' }, clan: { name: 'AURORA', role: '클랜원' }, avatar: { name: '테란여제 조은', image: '/assets/ui/avatars-v1/lobby-v1/avatar-f09-terran-empress-joeun-lobby-v1-640.webp' } },
  ranked: { season: '시즌 12', state: 'RANKED', tier: { id: 'challenger', name: '챌린저', color: '#79c8ef' }, rank: 3, score: 3850, wins: 124, losses: 38, bestRank: 1, completedSeasons: 8, longestStreak: 3, currentStreak: 3,
    history: [3, 2, 1].map((rank, i) => ({ season: '시즌 ' + (11 - i), settledAt: `2026-08-${30 - i * 5}T13:00:00Z`, rank, tier: '챌린저', tierId: 'challenger', score: 3000 })) },
  clanHistory: [{ season: 3, clan: 'AURORA', settledAt: '2026-09-01T13:00:00Z' }, { season: 2, clan: 'AURORA', settledAt: '2026-08-20T13:00:00Z' }],
  trophies: TROPHY_CATALOG.map((t, i) => ({ ...t, ...trophyData[i], owned: true, effect: { enabled: false } })),
  frame: { name: '옵시디언', level: 0, enhancement: { enabled: false } }, effects: { enabled: false, modifiers: [] }, historyLimit: 12
};
const fresh = structuredClone(profile); fresh.player.nickname = '새로운모험가'; fresh.player.title = null; fresh.player.avatar = null; fresh.player.clan = null;
Object.assign(fresh.ranked, { tier: null, rank: null, score: null, state: 'UNRANKED', wins: 0, losses: 0, bestRank: null, completedSeasons: 0, longestStreak: 0, currentStreak: 0, history: [] });
fresh.clanHistory = []; fresh.trophies.forEach(t => Object.assign(t, { owned: false, count: 0, progress: 0, acquiredAt: null }));
document.querySelector('#veteran').onclick = () => PlayerCallingCard.open({ previewData: profile });
document.querySelector('#newcomer').onclick = () => PlayerCallingCard.open({ previewData: fresh });
document.querySelector('#failure').onclick = () => { window.apiRequest = async () => { throw new Error('검수용 연결 실패 · 실제 서버 요청은 전송되지 않았습니다.'); }; PlayerCallingCard.open({ userId: 'preview' }); };
const params = new URLSearchParams(location.search), mode = params.get('mode');
if (mode === 'mobile' || mode === 'narrow') {
  const iframe = document.createElement('iframe'); iframe.title = '모바일 명함 검수'; iframe.src = './?embedded=1'; iframe.style.width = mode === 'narrow' ? '340px' : '390px'; document.querySelector('main').appendChild(iframe);
} else if (params.has('embedded')) { document.body.classList.add('embedded'); PlayerCallingCard.open({ previewData: profile }); }
else PlayerCallingCard.open({ previewData: profile });
