import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {clanParticipationFixtureSchema} from './helpers/clan-participation-fixture.mjs';
import {__clanTest,clanWarReservationCheck} from '../functions/_clan.js';
import {CLAN_PARTICIPATION_DEFAULTS,clanParticipationSchema,ensureClanParticipationSchema,clanWarParticipationSettings,participationRuleCandidate,participationAmounts,clanParticipationProgress,clanParticipationReplay,settleClanParticipationBattle,validateClanParticipationSettings,prepareClanParticipationSettings} from '../functions/_clan_participation.js';

class D1Fixture {
  constructor(){this.sql=new DatabaseSync(':memory:');this.failAt='';}
  prepare(source){const db=this;return{source,values:[],bind(...values){this.values=values;return this},async first(){return db.sql.prepare(source).get(...this.values)||null},async all(){return{results:db.sql.prepare(source).all(...this.values)}},async run(){const r=db.sql.prepare(source).run(...this.values);return{meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}}}
  async batch(statements){this.sql.exec('BEGIN');try{const results=[];for(const s of statements){if(this.failAt&&s.source.includes(this.failAt))throw new Error('INJECTED_FAILURE');results.push({meta:this.sql.prepare(s.source).run(...s.values)})}this.sql.exec('COMMIT');return results}catch(e){this.sql.exec('ROLLBACK');throw e}}
}
const settings=()=>({...__clanTest.CLAN_ADMIN_SETTINGS_DEFAULTS,participationEnabled:true,participationEffectiveAt:'2026-09-05T12:00:00.000Z',mode:'ON',battleParticipationRewardsEnabled:true,battleParticipationCoin:101,battleWinBonusPercent:20,participationMilestoneCoin:500,scorePolicy:'ATTACKER_PARTICIPATION_V1',sharedDefenseLimit:false});
function fixture(t){
  const DB=new D1Fixture();t.after(()=>DB.sql.close());DB.sql.exec([...clanParticipationFixtureSchema(),...clanParticipationSchema()].join(';'));
  DB.sql.exec('INSERT INTO users(id,coin) VALUES(1,1000),(2,1000),(3,1000); INSERT INTO clan_members(season_id,user_id,clan_id) VALUES(4,1,10),(4,2,20),(4,3,10)');
  DB.sql.prepare("INSERT INTO clan_wars(id,season_id,round_no,status,clan_a_id,clan_b_id,starts_at,ends_at) VALUES(8,4,2,'ACTIVE',10,20,?,?)").run(new Date(Date.now()-55*60000).toISOString(),new Date(Date.now()+5*60000).toISOString());
  const env={DB},war={...DB.sql.prepare('SELECT * FROM clan_wars').get()};
  function battle(id,won=false,userId=1){
    DB.sql.prepare("INSERT INTO clan_war_battles(id,request_id,season_id,war_id,attacker_user_id,attacker_clan_id,defender_user_id,defender_clan_id,status) VALUES(?,?,4,8,?,10,2,20,'RESOLVING')").run(id,`request-${id}`,userId);
    return {war,receipt:{id,request_id:`request-${id}`},userId,clanId:10,defenderId:2,winnerClanId:won?10:20,won,settings:settings(),result:{winner:won?'ATTACKER':'DEFENDER'}};
  }
  return{env,war,battle,sql:DB.sql};
}

test('10연패도 자기 클랜 +10 / 상대 +0, 매회 기본 코인 + 5회 보너스 1회',async t=>{
  const f=fixture(t);for(let id=1;id<=10;id++){const r=await settleClanParticipationBattle(f.env,f.battle(id));assert.equal(r.clanWar.participationReward.milestoneCoin,id===5?500:0)}
  const war=f.sql.prepare('SELECT * FROM clan_wars').get();assert.equal(war.score_a,10);assert.equal(war.score_b,0);assert.equal(war.battle_count,10);
  assert.equal(f.sql.prepare('SELECT coin FROM users WHERE id=1').get().coin,2510);
  assert.equal(f.sql.prepare('SELECT contribution_score FROM clan_members WHERE user_id=2').get().contribution_score,0);
  assert.deepEqual(await clanParticipationProgress(f.env,8,1),{completedAttacks:10,earnedPoints:10,earnedCoin:1510,milestoneAwarded:true,milestoneGoal:5});
});
test('승리 +3, 기본 보상 +20% 내림, 중복·동시 재시도에도 한 번만 정산',async t=>{
  const f=fixture(t),input=f.battle(1,true);await Promise.all([settleClanParticipationBattle(f.env,input),settleClanParticipationBattle(f.env,input)]);
  const r=await clanParticipationReplay(f.env,'request-1',1);assert.equal(r.clanWar.pointsAwarded,3);assert.equal(r.clanWar.participationReward.coin,121);
  assert.equal(f.sql.prepare('SELECT score_a FROM clan_wars').get().score_a,3);assert.equal(f.sql.prepare('SELECT coin FROM users WHERE id=1').get().coin,1121);
  f.sql.exec('DELETE FROM clan_war_battles');assert.equal((await clanParticipationReplay(f.env,'request-1',1)).replayed,true);
  await assert.rejects(clanParticipationReplay(f.env,'request-1',3),/다른 계정/);
});
test('동시 5·6회 정산은 5회 보너스 한 번만 지급',async t=>{
  const f=fixture(t);for(let id=1;id<=4;id++)await settleClanParticipationBattle(f.env,f.battle(id));
  const results=await Promise.all([settleClanParticipationBattle(f.env,f.battle(5,true)),settleClanParticipationBattle(f.env,f.battle(6))]);
  assert.equal(results.reduce((s,r)=>s+r.clanWar.participationReward.milestoneCoin,0),500);assert.equal((await clanParticipationProgress(f.env,8,1)).completedAttacks,6);
});
test('B팀 공격도 공격자 팀 점수만 가산한다',async t=>{
  const f=fixture(t),input=f.battle(1,true);f.sql.exec('UPDATE clan_war_battles SET attacker_user_id=2,attacker_clan_id=20,defender_user_id=1,defender_clan_id=10');
  Object.assign(input,{userId:2,clanId:20,defenderId:1,winnerClanId:20});await settleClanParticipationBattle(f.env,input);
  const score=f.sql.prepare('SELECT score_a,score_b FROM clan_wars').get();assert.equal(score.score_a,0);assert.equal(score.score_b,3);assert.equal(f.sql.prepare('SELECT coin FROM users WHERE id=2').get().coin,1121);
});
test('배치 중간 장애는 점수·지갑·전적·영수증 전체 롤백 후 재시도 성공',async t=>{
  const f=fixture(t),input=f.battle(1);f.env.DB.failAt='UPDATE clan_members';await assert.rejects(settleClanParticipationBattle(f.env,input),/INJECTED/);
  assert.equal(f.sql.prepare('SELECT coin FROM users WHERE id=1').get().coin,1000);assert.equal(f.sql.prepare('SELECT score_a FROM clan_wars').get().score_a,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM clan_participation_receipts').get().n,0);assert.equal(f.sql.prepare('SELECT status FROM clan_war_battles').get().status,'RESOLVING');
  f.env.DB.failAt='';await settleClanParticipationBattle(f.env,input);assert.equal(f.sql.prepare('SELECT coin FROM users WHERE id=1').get().coin,1101);
});
for(const [label,mutation] of [
  ['종료 대진',"UPDATE clan_wars SET status='COMPLETED'"],['실패 예약',"UPDATE clan_war_battles SET status='FAILED'"],
  ['공격자 탈퇴','DELETE FROM clan_members WHERE user_id=1'],['방어자 이적','UPDATE clan_members SET clan_id=10 WHERE user_id=2'],
  ['지갑 없음','DELETE FROM users WHERE id=1'],['잔액 안전 정수 초과','UPDATE users SET coin=9007199254740991 WHERE id=1']
])test(`${label}: 0행 지급 대상은 점수·정산 완료 없이 차단`,async t=>{
  const f=fixture(t),input=f.battle(1);f.sql.exec(mutation);await assert.rejects(settleClanParticipationBattle(f.env,input),/정산 대상/);assert.equal(f.sql.prepare('SELECT score_a FROM clan_wars').get().score_a,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM clan_participation_receipts').get().n,0);
});
test('TEST / 보상 OFF는 실제 경제 지급 없이 참여 점수만 반영',async t=>{
  const f=fixture(t),input=f.battle(1);input.settings.mode='TEST';const result=await settleClanParticipationBattle(f.env,input);assert.equal(result.clanWar.pointsAwarded,1);assert.equal(result.clanWar.participationReward.coin,0);assert.equal(f.sql.prepare('SELECT coin FROM users WHERE id=1').get().coin,1000);
  assert.equal(participationAmounts({...settings(),battleParticipationRewardsEnabled:false},true).baseCoin,0);
});
test('공유 방어 상한만 해제: 개인 21회, 동일 상대 1회, 실패 복원 유지',async t=>{
  const f=fixture(t);for(let i=1;i<=21;i++)f.battle(i,false,3);
  assert.equal((await clanWarReservationCheck(f.env,f.war,1,2,settings())).ok,true);
  assert.equal((await clanWarReservationCheck(f.env,f.war,1,2,{...settings(),sharedDefenseLimit:true})).code,'CLAN_DEFENSE_LIMIT');
  assert.equal((await clanWarReservationCheck(f.env,f.war,3,2,settings())).code,'CLAN_USE_LIMIT');
  f.battle(22);assert.equal((await clanWarReservationCheck(f.env,f.war,1,2,settings())).code,'CLAN_REPEAT_TARGET_LIMIT');
  f.sql.exec("UPDATE clan_war_battles SET status='FAILED' WHERE id=22");assert.equal((await clanWarReservationCheck(f.env,f.war,1,2,settings())).ok,true);
});
test('라운드 시작 전 미리보기는 변경 가능 / 시작 후 모든 대진 동일 고정',async t=>{
  const f=fixture(t),war={...f.war,starts_at:'2026-09-05T12:00:00.000Z'},before=Date.parse(war.starts_at)-1000,after=before+2000;
  await clanWarParticipationSettings(f.env,war,settings(),before);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM clan_participation_round_rules').get().n,0);
  const frozen=await clanWarParticipationSettings(f.env,war,settings(),after);
  const second=await clanWarParticipationSettings(f.env,{...war,id:9},{...settings(),battleParticipationCoin:999,participationEnabled:false},after);
  assert.equal(frozen.scorePolicy,'ATTACKER_PARTICIPATION_V1');assert.equal(second.scorePolicy,frozen.scorePolicy);assert.equal(second.battleParticipationCoin,101);
  assert.equal(participationRuleCandidate({...war,starts_at:'2026-09-03T12:00:00Z'},settings()).scorePolicy,'LEGACY_WINNER');
});
test('CMS 변경은 미조회 진행 라운드도 구 규칙 보존 / 다음 라운드부터 활성화',async t=>{
  const f=fixture(t),now=Date.now(),future=new Date(now+86400000).toISOString();f.sql.prepare("INSERT INTO clan_wars(id,season_id,round_no,status,starts_at,ends_at) VALUES(9,4,3,'SCHEDULED',?,?)").run(future,new Date(now+90000000).toISOString());
  const previous={...settings(),...CLAN_PARTICIPATION_DEFAULTS},next=await prepareClanParticipationSettings(f.env,previous,settings(),now);
  assert.equal(next.participationEffectiveAt,future);assert.equal((await clanWarParticipationSettings(f.env,f.war,next,now)).scorePolicy,'LEGACY_WINNER');
});
test('CMS는 음수·소수·과대금액·기본0 ON·TEST경제·백데이트 우회를 거절',()=>{
  for(const value of [-1,0.5,100000001,NaN,Infinity,null,''])assert.throws(()=>validateClanParticipationSettings({battleParticipationCoin:value},settings()));
  assert.throws(()=>validateClanParticipationSettings({}, {...settings(),battleParticipationCoin:0}));assert.throws(()=>validateClanParticipationSettings({}, {...settings(),mode:'TEST'}));
  assert.doesNotThrow(()=>validateClanParticipationSettings({battleParticipationCoin:100000000},settings()));
});
test('신규 스키마 설치는 멱등, 경제 영수증은 시즌 초기화·보존기간 삭제에서 유지',async t=>{
  const f=fixture(t);await ensureClanParticipationSchema(f.env);await ensureClanParticipationSchema(f.env);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM app_meta').get().n,1);
  const source=readFileSync(new URL('../functions/_clan.js',import.meta.url),'utf8');assert.doesNotMatch(source,/DELETE FROM clan_participation_receipts/);assert.equal((source.match(/base_coin\+win_bonus_coin\+milestone_coin>0/g)||[]).length,2);
});
test('클라이언트는 재요청 ID 유지·공격자 득점·코인 동기화·최소 응답 복구를 지원',()=>{
  let client=readFileSync(new URL('../js/clan-v1.js',import.meta.url),'utf8').replace('global.ClanV1={view,bind,stop,state};','global.ClanV1={state,scoreRuleText,battleResultText,pendingRequest,finishRequest};');
  const storage=new Map(),window={sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},crypto:{randomUUID:()=>crypto.randomUUID()}};
  vm.runInNewContext(client,{window});const api=window.ClanV1,id=api.pendingRequest('one');assert.equal(api.pendingRequest('one'),id);api.state.pending.clear();assert.equal(api.pendingRequest('one'),id);api.finishRequest('one');assert.notEqual(api.pendingRequest('one'),id);
  assert.match(api.battleResultText({result:'LOSE',clanWar:{scorePolicy:'ATTACKER_PARTICIPATION_V1',pointsAwarded:1}}),/우리 클랜 \+1점/);assert.match(client,/if\(data.replayed\)/);assert.match(client,/syncBattleWallet\(data.wallet\)/);
});
