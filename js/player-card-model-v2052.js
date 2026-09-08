// Shared trophy definitions. Eligibility is evaluated only from official server settlements.
export const TROPHY_CATALOG = Object.freeze([
  { code: 'CLAN_CHAMPION', name: '클랜의 영광', category: 'CLAN CHAMPION', rule: '공식 클랜 시즌 우승 당시 우승 클랜에 소속', art: '/assets/ui/player-card/clan-champion-v2052.webp', tone: 'gold' },
  { code: 'CHALLENGER_STREAK_3', name: '푸른 왕조', category: 'CHALLENGER DYNASTY', rule: '연속된 공식 랭크 시즌 3회에서 모두 챌린저로 최종 정산', art: '/assets/ui/player-card/challenger-streak-v2052.webp', tone: 'blue' },
  { code: 'RANKED_CHAMPION', name: '정점의 증명', category: 'RANKED CHAMPION', rule: '공식 랭크 시즌 종료 정산 최종 1위에게 시즌당 1개 지급 · 진행 중 순위는 미반영', art: '/assets/ui/player-card/ranked-champion-v2052.webp', tone: 'ruby' },
  { code: 'CLAN_CHAMPIONS_TROPHY', name: '챔피언스리그 우승', category: 'CHAMPIONS LEAGUE', rule: '공식 챔피언스리그 최종 우승 클랜의 확정 참가 명단에 소속 · 대회당 1개 지급', art: '/assets/ui/player-card/clan-champion-v2052.webp', tone: 'gold' }
]);
