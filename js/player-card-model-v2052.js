// Shared trophy definitions. Eligibility is evaluated only from official server settlements.
export const TROPHY_CATALOG = Object.freeze([
  { code: 'DUO_CHALLENGER', name: '듀오 챌린저', category: 'DUO CHALLENGER', rule: '공식 듀오 시즌 종료 시 최종 1~10위 팀의 두 사람에게 각각 시즌당 1개 지급', art: '/assets/ui/ranked-duo/challenger-trophy-v2.webp', tone: 'blue' },
  { code: 'CLAN_CHAMPION', name: '클랜의 영광', category: 'CLAN CHAMPION', rule: '공식 클랜 시즌 우승 당시 우승 클랜에 소속', art: '/assets/ui/player-card/clan-champion-v2052.webp', tone: 'gold' },
  { code: 'CHALLENGER_STREAK_3', name: '푸른 왕조', category: 'CHALLENGER DYNASTY', rule: '연속된 공식 랭크 시즌 3회에서 모두 챌린저로 최종 정산', art: '/assets/ui/player-card/challenger-streak-v2052.webp', tone: 'blue' },
  { code: 'RANKED_CHAMPION', name: '정점의 증명', category: 'RANKED CHAMPION', rule: '공식 랭크 시즌 종료 정산 최종 1위에게 시즌당 1개 지급 · 진행 중 순위는 미반영', art: '/assets/ui/player-card/ranked-champion-v2052.webp', tone: 'ruby' },
  { code: 'CLAN_CHAMPIONS_TROPHY', name: '챔피언스리그 우승', category: 'CHAMPIONS LEAGUE', rule: '공식 챔피언스리그 최종 우승 클랜의 확정 참가 명단에 소속 · 대회당 1개 지급', art: '/assets/ui/player-card/champions-league-v2109.webp', tone: 'platinum' },
  { code: 'PREDICTION_STAKE_300T', name: '승부예측 300조 감사패', category: 'PREDICTION MILESTONE', rule: '정산 완료된 승부예측 누적 베팅액 300조 이상 · 적중 여부 무관 · 진행 중·무효·환불 제외', art: '/assets/ui/player-card/prediction-300trillion-appreciation-v1.webp', tone: 'gold' },
  { code: 'CITY_TOP_25', name: '도시의 무법자', category: 'CITY OUTLAW', subtitle: '족각도시 현금 TOP 누적 25회', rule: '6시간 교대 종료 시 해당 회차 참여자의 보유 현금 1위 누적 25회 · 자동 수입 반영 · 동률 공동 1위 · TEST 제외 · 기능 적용 회차부터 집계', art: '/assets/ui/player-card/milestones-20261011/city-outlaw-v1.webp', tone: 'gold' },
  { code: 'LICH_KING_CLEAR_1000', name: '서리한', category: 'FROSTMOURNE', subtitle: '리치왕 정벌 성공 1,000회', rule: '리치왕 정벌 성공 누적 1,000회 · 성공 시 남아 있는 참가자 기준 · 주간 보상 횟수와 무관 · TEST·실패·해산 제외 · 확인 가능한 기존 성공 기록 포함', art: '/assets/ui/player-card/milestones-20261011/frostmourne-v1.webp', tone: 'blue' }
]);
