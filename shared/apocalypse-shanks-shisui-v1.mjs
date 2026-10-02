const ROOT='/assets/ui/project-v/monsters/apocalypse-shanks-shisui-v1';
const skill=(boss,kind,name,description,settings)=>({
 code:`${boss.toUpperCase()}_${kind.toUpperCase()}`,boss,kind,name,description,
 asset:`${boss}-${kind}`,atlas:`${ROOT}/${boss}-${kind}-atlas.json`,frameCount:12,collisionFrame:6,
 impactAt:kind==='ultimate'?1.15:.8,duration:kind==='ultimate'?2.25:1.8,anchor:{x:.5,y:.9},...settings
});

// User-authorized continuation after the live 80M / 20% Kaneki profile.
export const APOCALYPSE_SHANKS_SHISUI_BOSSES=Object.freeze([
 {
  key:'shanks',code:'APOCALYPSE_SHANKS',monsterId:77,name:'샹크스',subtitle:'붉은 패왕의 군림',color:'#e83b46',
  battlePower:120000000,powerRatio:1.5,battleSuitSkillDefensePercent:35,
  sourceArt:`${ROOT}/shanks-source.jpg`,battleSprite:`${ROOT}/shanks-sd-v1.png`,
  skills:[
   skill('shanks','seal','패왕색 · 위압 봉인','공격력이 높은 적 3명의 스킬을 각자 3행동 동안 봉인합니다. 일반 공격은 유지되며 정화로 해제할 수 있습니다.',{targetCount:3,statusActions:3,dispel:true}),
   skill('shanks','curse','패기 잠식 · 생명 억압','적 전체의 회복·재생·흡혈을 각자 3행동 동안 100% 차단합니다. 정화로 해제할 수 있습니다.',{targetCount:'ALL',statusActions:3,healReductionPercent:100,dispel:true}),
   skill('shanks','ultimate','신살 · 패왕참','패왕색 검격으로 적 전체에 공격력 45% 피해를 가하며 피해의 50%가 보호막을 관통합니다.',{targetCount:'ALL',attackPercent:45,shieldPiercePercent:50})
  ]
 },
 {
  key:'shisui',code:'APOCALYPSE_UCHIHA_SHISUI',monsterId:78,name:'우치하 시스이',subtitle:'별천신의 종언',color:'#35ed99',
  battlePower:180000000,powerRatio:2.25,battleSuitSkillDefensePercent:50,
  sourceArt:`${ROOT}/shisui-source.jpg`,battleSprite:`${ROOT}/shisui-sd-v1.png`,
  skills:[
   skill('shisui','seal','별천신 · 환술 봉인','공격력이 높은 적 4명의 스킬을 각자 4행동 동안 봉인합니다. 일반 공격은 유지되며 정화로 해제할 수 있습니다.',{targetCount:4,statusActions:4,dispel:true}),
   skill('shisui','curse','까마귀 환술 · 생명 차단','적 전체의 회복·재생·흡혈을 각자 4행동 동안 100% 차단합니다. 정화로 해제할 수 있습니다.',{targetCount:'ALL',statusActions:4,healReductionPercent:100,dispel:true}),
   skill('shisui','ultimate','스사노오 · 취풍참','녹색 스사노오의 검격으로 적 전체에 공격력 70% 피해를 가하며 피해의 65%가 보호막을 관통합니다.',{targetCount:'ALL',attackPercent:70,shieldPiercePercent:65})
  ]
 }
]);
