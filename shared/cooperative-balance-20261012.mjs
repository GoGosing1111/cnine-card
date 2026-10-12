// Reviewed stage budgets. Applied explicitly once to CMS; no runtime overwrite
// of an operator's later settings. Existing rooms retain their own snapshot.
export function rebalanceCoopCombat(current){
 const combat=structuredClone(current);
 combat.stages[0].hint='서로 다른 몬스터 3종을 격파하세요. 방벽·독·약화에 대응할 조합을 준비하세요.';
 combat.stages[1].hint='준보스의 특성을 확인하고 방벽 파괴·약화·보호·회복 효과를 연결하세요.';
 combat.stages[2].hint='최종 보스를 제한 시간 안에 격파하세요. 전투는 편성한 스킬로 자동 진행됩니다.';
 const plans={
  NORMAL:{power:[240000,240000,240000,1000000,2000000],hp:[200,200,200,500,1200],count:[1,1,1,1,1],forced:6,recommendation:'SS 용병 · 강화 카드와 보호·회복을 함께 준비'},
  HARD:{power:[4200000,4200000,4200000,17500000,35000000],hp:[200,200,200,500,1200],count:[1,1,1,2,2],forced:4,recommendation:'SS 리미티드·SSS 중심 · 보스별 약화와 생존 조합'},
  EXTREME:{power:[21600000,21600000,18000000,100800000,170000000],hp:[250,250,250,600,1200],count:[2,2,2,3,3],forced:3,recommendation:'SSS 리미티드·최상위 성장 · 분대별 화력과 팀 보호·정화'}
 };
 for(const d of combat.difficulties){const p=plans[d.id];d.forcedEvery=p.forced;d.recommendation=p.recommendation;
  d.monsters=d.monsters.map((m,i)=>({...m,power:p.power[i],hpPercent:p.hp[i],attackPercent:100,defensePercent:100,shieldPercent:0,attackCount:p.count[i]}));}
 return combat;
}
