export const QUEST_COMMAND_VERSION='20261103-v1';
export const QUEST_COMBAT_POLICY_KEY='quest_combat_policy_20261103_v1';
export const QUEST_NPC=Object.freeze({name:'서린',label:'최고사령부 - 서린'});
export const WEEKLY_COMBAT_REWARDS=Object.freeze({CORE_RAID:15_000_000_000_000,TERRITORY:20_000_000_000_000,CLAN:50_000_000_000_000});
export const DAILY_COMBAT_QUESTS=Object.freeze([
 {id:'RANKED',title:'랭크전 30회 참여',target:30,unit:'회',coin:3_000_000_000_000,masterStars:10_000_000,icon:'pvp',route:'pvp',description:'직접 시작해 끝낸 랭크전 30경기를 집계합니다. 승패와 관계없이 한 경기당 1회이며, 차전 수·방어전·재요청은 추가로 세지 않습니다.'},
 {id:'WORLD_RAID',title:'월드레이드 5회 참여',target:5,unit:'회',coin:1_000_000_000_000,masterStars:10_000_000,icon:'raid',route:'raid',description:'출전 편성을 갖추고 끝까지 참여한 월드레이드 5개 방을 집계합니다. 같은 방은 1회이며, 대기·중도 이탈·운영 테스트 방은 제외합니다.'},
 {id:'DUO_RANKED',title:'듀오랭크 10회 참여',target:10,unit:'회',coin:2_000_000_000_000,masterStars:10_000_000,icon:'duo',route:'duo',description:'내가 직접 시작해 완료한 듀오랭크 10경기를 집계합니다. 승패와 무관하며, 자동 선정된 동료·상대 출전과 취소된 경기는 제외합니다.'}
]);
export const QUEST_PRESENTATION=Object.freeze({
 CORE_RAID:{icon:'raid',route:'battle',briefing:['월드 레이드와 별개로 공대 레이드 전선이 열려 있습니다.','붕괴코어·리치왕 정벌·바르센·흑익의 맹약에서 유효한 전투 참여를 합계 7회 완료하십시오. 같은 방의 반복 공략은 한 번만 기록합니다.'],progress:['공대의 전투 보고를 계속 받고 있습니다.','붕괴코어의 공략을 마치거나 다른 공대 레이드의 전투를 끝내십시오. 월드 레이드 기록은 이 작전에 합산되지 않습니다.'],ready:['일곱 번의 공대 전투 기록을 확인했습니다.','핵심 공략과 동료 지원을 이어 온 공로입니다. 작전 보상 15조 코인을 메시지함으로 전달하겠습니다.']},
 TERRITORY:{icon:'territory',route:'territory',briefing:['전황 지도에 적의 공격선이 표시됐습니다.','영토전에 직접 출전해 공격 한 번을 끝내십시오. 자동 편성이나 방어 기록이 아니라, 당신이 지휘한 공격을 확인하겠습니다.'],progress:['아직 완료된 공격 보고가 도착하지 않았습니다.','영토전에서 목표 지점을 선택하고 직접 전투를 끝내십시오. 승패와 관계없이 실제 공격 참여를 기록합니다.'],ready:['영토전 공격 보고를 접수했습니다.','당신의 부대가 전선에서 역할을 수행한 것을 확인했습니다. 참여 보상 20조 코인을 메시지함으로 보내겠습니다.']},
 CLAN:{icon:'clanWar',route:'clanWar',briefing:['클랜전은 혼자 앞서 나가는 싸움이 아닙니다.','클랜원과 공격 대상을 조율하고 직접 전투 1회를 완료하십시오. 방어전은 제외하며, 승패보다 지휘관의 실제 출전을 확인합니다.'],progress:['클랜의 공격 대진을 다시 확인하십시오.','동료와 목표를 나누고 맡은 전투를 끝내세요. 완료 보고 한 건이 도착하면 이번 주 클랜전 임무를 마감하겠습니다.'],ready:['클랜전 출전과 전투 완료를 확인했습니다.','동료와 함께 싸운 공로에 대한 보상입니다. 50조 코인을 메시지함으로 전달하겠습니다.']},
 RANKED:{icon:'pvp',route:'pvp',briefing:['상대 지휘관의 선봉과 후속 편성을 읽어야 합니다.','오늘 랭크전 30경기를 직접 완료하십시오. 승리뿐 아니라 패배 기록도 전술 자료가 됩니다. 한 경기의 여러 차전은 합쳐서 1회입니다.'],progress:['누적된 경기 기록에서 다음 상대의 대응을 준비하십시오.','선봉에 힘을 몰았다면 후속 차전의 생존력도 살펴보세요. 승패와 관계없이 끝낸 경기만 오늘의 출전으로 인정합니다.'],ready:['오늘 랭크전 30경기, 전투 기록을 확인했습니다.','반복된 교전 속에서 진형을 조정한 공로입니다. 코인 3조와 마스터의 별 1,000만 개를 함께 지급하겠습니다.']},
 WORLD_RAID:{icon:'raid',route:'raid',briefing:['대형 개체가 출현했습니다. 월드 레이드 전선에 합류하십시오.','출전 편성을 갖추고 서로 다른 레이드 방 5곳의 전투를 끝까지 마치세요. 중도 이탈하거나 대기만 한 기록은 출전으로 인정하지 않습니다.'],progress:['월드 레이드 전선에서 추가 전투 보고를 기다리고 있습니다.','전투가 끝날 때까지 부대를 유지하십시오. 같은 방을 다시 조회해도 횟수는 늘지 않으며, 완료된 다른 방의 기록이 필요합니다.'],ready:['월드 레이드 5개 방의 전투 종료와 참여를 확인했습니다.','공동 전선에 끝까지 남아 준 공로입니다. 코인 1조와 마스터의 별 1,000만 개를 지급하겠습니다.']},
 DUO_RANKED:{icon:'duo',route:'duo',briefing:['듀오 전선에서는 동료의 빈틈을 메우는 판단이 필요합니다.','오늘 듀오랭크 10경기를 직접 시작해 완료하십시오. 동료로 자동 선정된 출전은 제외하며, 승패와 무관하게 내 도전 기록을 확인합니다.'],progress:['동료의 공격과 당신의 방어가 맞물리도록 편성을 점검하세요.','직접 시작해 끝낸 듀오 경기만 누적됩니다. 취소된 매칭 대신 다음 교전에서 끝까지 지휘하십시오.'],ready:['직접 지휘한 듀오랭크 10경기를 확인했습니다.','동료와 전선을 유지한 보상으로 코인 2조와 마스터의 별 1,000만 개를 지급하겠습니다.']},
 POST:{icon:'messages',route:'messages',briefing:['전투가 끝나면 후방에 상황을 전하는 일도 필요합니다.','PLAY DK에 작성한 게시글을 확인하겠습니다. 인증된 계정의 실제 작성 기록을 불러온 뒤 목표와 보상을 확인해 주세요.'],progress:['전선의 기록은 다음 작전을 준비하는 자료가 됩니다.','작성글 확인을 눌러 오늘 또는 이번 주의 게시글 수를 갱신하세요. 인증된 계정과 지정 게시판의 기록만 반영합니다.'],ready:['게시글 작성 목표를 달성한 기록을 확인했습니다.','후방에 소식을 전해 주셔서 감사합니다. 화면에 표시된 해당 기간의 보상을 수령하십시오.']}
});
export function questNpcLines(quest,{phase='inspect',weekly=false}={}){
 const copy=QUEST_PRESENTATION[quest?.id]||QUEST_PRESENTATION.POST;
 if(phase==='error')return ['전투 보고를 확인하는 통신이 지연되고 있습니다.','수령 여부를 다시 조회하겠습니다. 같은 요청을 반복해도 완료된 보상은 추가 지급되지 않습니다.'];
 if(!quest)return weekly?['이번 주 공대 레이드와 영토전·클랜전의 전투 보고를 받겠습니다.','어느 전선에 출전할지 선택하십시오. 작전별 참여 조건과 보상을 직접 설명하겠습니다.']:['오늘은 단독 랭크전과 듀오 전선, 월드 레이드에 출전해 주십시오.','승패만으로 임무를 판단하지 않습니다. 실제로 끝낸 전투 기록을 확인하고 보상을 지급하겠습니다.'];
 if(quest.claimed)return [weekly?'해당 주간 임무의 보상 처리는 이미 완료했습니다.':'해당 일일 임무의 보상 지급을 이미 마쳤습니다.',weekly?'전달된 보상은 메시지함에서 확인하십시오. 같은 주의 작전 보고로 다시 지급할 수는 없습니다.':quest.id==='POST'?'지급된 코인은 보유 재화에 반영됩니다. 다음 임무를 준비하십시오.':'지급된 코인과 마스터의 별은 보유 재화에 반영됩니다. 다음 임무를 준비하십시오.'];
 if(quest.blocked)return ['지휘관의 신원 확인이 먼저입니다.','PLAY DK 2차 인증을 완료해야 퀘스트 보상을 수령할 수 있습니다. 전투 목표와 현재 보고는 이곳에서 확인하십시오.'];
 if(quest.enabled===false)return ['현재 이 임무의 보상 지급이 중지되어 있습니다.','전투 기록과 기존 수령 내역은 유지됩니다. 지급이 다시 열리면 최신 목표를 확인하십시오.'];
 if(quest.available===false&&quest.id!=='POST')return ['해당 전선의 공식 전투 보고를 아직 조회할 수 없습니다.','집계가 확인될 때까지 수령을 진행하지 않겠습니다. 잠시 후 기록을 새로고침해 주세요.'];
 if(quest.count>=quest.target){if(weekly&&quest.id!=='POST')return [copy.ready[0],`화면에 표시된 ${quest.rewardLabel||'작전'} 보상을 메시지함으로 전달하겠습니다. 수령 절차를 진행하십시오.`];return copy.ready;}
 if(phase==='accepted'||quest.count>0){const left=Math.max(0,quest.target-quest.count);return [copy.progress[0],`${copy.progress[1]} 현재 ${quest.count}/${quest.target}${quest.unit}, ${left}${quest.unit} 남았습니다.`];}
 return copy.briefing;
}
