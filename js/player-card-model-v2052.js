// Shared trophy definitions. Eligibility is evaluated only from official server settlements.
export const TROPHY_CATALOG = Object.freeze([
  { code: 'CLAN_CHAMPION', name: '클랜의 영광', category: 'CLAN CHAMPION', rule: '공식 클랜 시즌 우승 당시 우승 클랜에 소속', art: '/assets/ui/player-card/clan-champion-v2052.webp', tone: 'gold' },
  { code: 'CHALLENGER_STREAK_3', name: '푸른 왕조', category: 'CHALLENGER DYNASTY', rule: '연속된 공식 랭크 시즌 3회에서 모두 챌린저로 최종 정산', art: '/assets/ui/player-card/challenger-streak-v2052.webp', tone: 'blue' },
  { code: 'RANKED_CHAMPION', name: '정점의 증명', category: 'RANKED CHAMPION', rule: '공식 랭크 시즌 최종 순위 1위', art: '/assets/ui/player-card/ranked-champion-v2052.webp', tone: 'ruby' }
]);
