import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPvpTimings} from '../functions/_pvp_performance.js';

const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const fight=source.slice(source.indexOf("if(path==='pvp/fight'&&request.method==='POST')"),source.indexOf("if(path==='pvp/history')"));
function fixture({win=true,deckLength=5,stale=false}={}){
  const users={1:{id:1,nickname:'a',role:'USER',coin:300},2:{id:2,nickname:'b',role:'USER',coin:900}};
  const profiles={1:{season_score:1000,highest_score:1000,wins:0,losses:0},2:{season_score:1000,highest_score:1000,wins:0,losses:0}};
  let energy=5,claimed=false,receipt=null;const effects=[],queries=[],settings={enabled:true,winCoin:50,loseCoin:25};
  const env={DB:{
    prepare(sql){let v=[];return {bind(...values){v=values;return this},async all(){queries.push(sql);assert.match(sql,/FROM pvp_match_history/);return {results:[]};},async first(){queries.push(sql);assert.match(sql,/FROM users/);return {...users[v[0]],magic_crystals:0};},async run(){queries.push(sql);
      if(sql.startsWith('UPDATE pvp_profiles'))Object.assign(profiles[v[4]],{season_score:v[0],highest_score:Math.max(profiles[v[4]].highest_score,v[1]),wins:profiles[v[4]].wins+v[2],losses:profiles[v[4]].losses+v[3]});
      else if(sql.startsWith('UPDATE users SET coin'))users[v[1]].coin+=v[0];
      else if(sql.startsWith('INSERT INTO pvp_match_history'))effects.push('history');
      else if(sql.startsWith('INSERT OR REPLACE INTO pvp_battle_audits'))effects.push('audit');
      else if(sql.startsWith('INSERT INTO coin_logs'))effects.push('coin_log');
      else if(!sql.startsWith('DELETE FROM pvp_ranked_match_tickets'))assert.fail('Unexpected write: '+sql);
      return {meta:{changes:1}};
    }};},
    async batch(statements){for(const statement of statements)await statement.run();}
  }};
  const reward=name=>async()=>{effects.push(name);return null;};
  const deps={
    ensureRankedPvpFoundation:async()=>{},rankedFightReceipt:async()=>receipt?{...receipt,replayed:true}:null,utcMs:()=>0,authenticate:async()=>users[1],readBody:async()=>({requestId:'ranked-performance-request',matchToken:'ticket'}),
    advancePvpSeasonLifecycle:async()=>({settings,settling:false}),burningEventSettings:async()=>({}),applyBurningPvpSettings:s=>s,isAdminRole:()=>false,
    claimRankedMatchTicket:async()=>{if(claimed)throw Object.assign(Error('used'),{status:409});claimed=true;return {token:'ticket',defender_id:2,attacker_score:stale?999:1000,defender_score:1000,attacker_power:500,defender_power:500};},
    ensurePvpProfile:async(_,user)=>({...profiles[user.id]}),
    pvpDeckSnapshot:async(_,id)=>Array.from({length:id===1?deckLength:5},(_,i)=>({id:String(i+1),rarity:'C',base_power:100,breakthrough_level:0})),
    battleSettings:async()=>({}),publicEquippedTitleMap:async()=>({}),cardBattlePower:()=>100,
    PRESTIGE_DECK_LIMIT:2,FUR_DECK_LIMIT:2,ZENITH_DECK_LIMIT:2,
    evaluateDeckSynergies:async()=>({totals:{attackPercent:0}}),
    cardUniqueDeckStates:async(_,entries)=>entries.map(x=>({enabled:false,power:500,cards:x.cards})),
    userEquipmentBonuses:async()=>({pvp:0}),magicBattleLoadout:async()=>({cards:[]}),equippedAvatarEffect:async()=>null,
    releasedMercenarySnapshot:async()=>null,mercenarySnapshotPower:()=>0,
    battleEngineState:()=>({active:true}),drawIntegrityHash:()=> 'abc123',
    createPvpBattleV2:()=>({result:{winner:win?'A':'B',reason:'ELIMINATION',actions:5,final:{A:[],B:[]}},teams:{A:{summary:{power:500}},B:{summary:{power:500}}}}),
    pvpSeasonScoreAdjustment:w=>({change:24}),consumePvpEnergy:async()=>{effects.push('energy');return {state:{energy}};},commitRankedFight:async(_,options)=>{await env.DB.batch(options.writes);receipt={...options.response,energy:{energy:--energy}};return receipt;},
    burningRewardAmount:amount=>amount,applyAvatarCoinGain:base=>({base,total:base,bonus:0,percent:0}),
    grantBattleCube:reward('cube'),grantHighGradeRerollDrop:reward('reroll'),magicSettings:async()=>({acquisition:{pvp:{enabled:true,chance:1,amount:1,dailyLimit:3}}}),
    resolveMagicCrystalReward:reward('magic'),safeEquipmentDrop:reward('equipment'),rollBlackMiracleDrop:reward('black'),safeUnifiedDrop:reward('unified'),
    premiumCubeWeeklyStatus:async()=>({remaining:1}),burningPublicState:()=>({}),uniqueBattleResponsePayload:()=>null,
    json:(data,status=200)=>({data,status})
  };
  const execute=Function('deps',`with(deps){return async(context)=>{const {env,request}=context;const path='pvp/fight';${fight}}}`)(deps);
  return {call:()=>execute({env,request:{method:'POST'},pvpTiming:createPvpTimings('pvp/fight')}),users,profiles,effects,queries,energy:()=>energy};
}

test('optimized ranked fight preserves win/loss energy, attacker-only coins, scores and reward ordering',async()=>{
  for(const win of [true,false]){
    const f=fixture({win}),r=await f.call();
    assert.equal(r.status,200);assert.equal(r.data.result,win?'WIN':'LOSE');assert.equal(f.energy(),4);
    assert.equal(f.users[1].coin,win?350:325);assert.equal(f.users[2].coin,900);
    assert.equal(r.data.coinAfter,f.users[1].coin);assert.equal(f.profiles[2].season_score,1000);assert.equal(f.profiles[2].wins+f.profiles[2].losses,0);assert.equal(r.data.scoreAfter,win?1024:976);
    assert.deepEqual(f.effects,['energy','history','audit','coin_log','cube',...(win?['reroll','magic','equipment','black','unified']:[])]);
    assert.equal(f.queries.filter(q=>q.includes('SELECT id,role')).length,0);
  }
});

test('stale scores and incomplete decks still stop before energy, scoring and rewards',async()=>{
  for(const options of [{stale:true},{deckLength:4}]){
    const f=fixture(options),r=await f.call();assert.ok([400,409].includes(r.status));assert.equal(f.energy(),5);
    assert.equal(f.users[1].coin,300);assert.equal(f.profiles[1].season_score,1000);assert.deepEqual(f.effects,[]);
  }
});

test('concurrent duplicate tickets and replay do not enter reward work twice',async()=>{
  const f=fixture(),results=await Promise.all([f.call(),f.call()]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal((await f.call()).data.replayed,true);
  assert.equal(f.energy(),4);assert.equal(f.users[1].coin,350);assert.equal(f.effects.filter(x=>x==='history').length,1);
});
