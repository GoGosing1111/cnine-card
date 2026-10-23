const root='/assets/ui/organization/hunts-20261023/';
export const ORGANIZATION_HUNTS=Object.freeze([
 {stage:3,name:'봉쇄된 물류기지',scene:'stage3-dockyard',description:'봉쇄된 항만 창고에서 철갑 병기들의 움직임을 추적합니다.',monster:{id:'stage3-monster',name:'철사갈퀴 추적자',description:'철사 같은 발톱으로 창고 사이를 누비는 기계 추적자.'},boss:{id:'stage3-boss',name:'철갑 집행자',description:'무거운 파쇄 망치로 물류기지의 출입을 봉쇄하는 집행 병기.'}},
 {stage:4,name:'침식된 비밀정원',scene:'stage4-garden',description:'저택의 장미 정원이 검붉은 가시와 검은 돌의 영역으로 변했습니다.',monster:{id:'stage4-monster',name:'흑장미 사냥개',description:'흑요석 몸체와 장미 가시를 두른 정원의 사냥개.'},boss:{id:'stage4-boss',name:'가시관 포식자',description:'가시관과 붉은 장미의 갈기를 지닌 거대한 정원의 포식자.'}},
 {stage:5,name:'공중금고',scene:'stage5-vault',description:'서울의 야경 위, 최상층 금고를 지키는 황금 수호자들과 대치합니다.',monster:{id:'stage5-monster',name:'금고 파수조',description:'검은 금속 날개와 금빛 관절로 상공을 순찰하는 파수조.'},boss:{id:'stage5-boss',name:'금고의 심판자',description:'거대한 열쇠검을 든 흑금의 갑주가 금고의 마지막 문을 지킵니다.'}}
].map(zone=>Object.freeze({...zone,enabled:false,status:'PREPARATION',stats:null,rewards:null,entryCost:null,scene:root+zone.scene+'.webp',monster:{...zone.monster,image:root+zone.monster.id+'.webp'},boss:{...zone.boss,image:root+zone.boss.id+'.webp'}})));
