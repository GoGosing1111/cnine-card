import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {NETWORK_NODES,NETWORK_EDGES,isNetworkWar,networkControl,networkTimeWinner} from '../shared/territory-network-v6.mjs';

export const NETWORK_SCHEMA='territory_network_v6_20261011';
export const networkSchemaStatements=postgres=>{
  const int=postgres?'BIGINT':'INTEGER';
  return [
    `CREATE TABLE IF NOT EXISTS territory_network_rounds(round_id ${int} PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 1,winner_side TEXT NOT NULL DEFAULT '' CHECK(winner_side IN ('','A','B','DRAW')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS territory_network_nodes(round_id ${int} NOT NULL,node_index INTEGER NOT NULL CHECK(node_index BETWEEN 0 AND 8),owner TEXT NOT NULL CHECK(owner IN ('','A','B')),front_id ${int},a_access INTEGER NOT NULL DEFAULT 0,b_access INTEGER NOT NULL DEFAULT 0,captured_at TEXT,PRIMARY KEY(round_id,node_index),UNIQUE(front_id))`
  ];
};
export async function ensureNetworkSchema(env){
  if(readRuntimeData(env,NETWORK_SCHEMA))return;
  if(!await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(NETWORK_SCHEMA).first()){
    const sql=networkSchemaStatements(env.DB.dialect==='postgres');
    if(env.DB.dialect==='postgres')await env.DB.execSchema(sql);else await env.DB.batch(sql.map(s=>env.DB.prepare(s)));
    await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(NETWORK_SCHEMA,'1').run();
  }
  cacheRuntimeData(env,NETWORK_SCHEMA,true,1800000);
}
const rows=result=>result?.results||[];
const fail=()=>{throw new Error('거점의 점령 상태 또는 진입 경로가 변경되었습니다. 지도를 다시 확인해 주세요.');};

function frontStatements(env,{roundId,node,sequence,status,startsAt,cfg}){
  const multiplier=node.type==='HOME'?cfg.homeHpMultiplier:node.type==='GATE'?cfg.gateHpMultiplier:node.type==='MID'?cfg.midHpMultiplier:node.type==='OUTPOST'?cfg.outpostHpMultiplier:1;
  const hp=Math.max(1000,Math.round(Number(cfg.baseSiegeHp||500000)*Number(multiplier||1)));
  return [
    env.DB.prepare(`INSERT INTO territory_war_v3_fronts(round_id,sequence,node_index,node_code,node_name,node_type,status,a_hp,b_hp,a_max_hp,b_max_hp,started_at,revisit_count)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(round_id,sequence) DO NOTHING`).bind(roundId,sequence,node.index,node.code,node.name,node.type,status,hp,hp,hp,hp,startsAt,Math.floor((sequence-1)/9)),
    // Pre-create facilities in the same transaction as the node pointer, including
    // when the round policy disables them. Policy remains the authority for use.
    env.DB.prepare(`INSERT INTO territory_battlefield_fronts(front_id,round_id) SELECT id,round_id FROM territory_war_v3_fronts WHERE round_id=? AND sequence=? ON CONFLICT(front_id) DO NOTHING`).bind(roundId,sequence)
  ];
}

export function networkFormationStatements(env,{round,cfg,status,starts,ends,assignments}){
  const token='NETWORK_FORM:'+round.id,control=networkControl();
  const s=[
    env.DB.prepare('UPDATE territory_war_v3_rounds SET version=version WHERE id=?').bind(round.id),
    env.DB.prepare(`INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM territory_war_v3_rounds WHERE id=? AND warfare_version=6 AND status='RECRUITING' AND version=?) THEN 1 ELSE 0 END`).bind(token,round.id,round.version),
    ...assignments,
    env.DB.prepare('INSERT INTO territory_network_rounds(round_id) VALUES(?)').bind(round.id)
  ];
  for(const node of control.nodes){s.push(...frontStatements(env,{roundId:round.id,node,sequence:node.index+1,status,startsAt:starts,cfg}),
    env.DB.prepare(`INSERT INTO territory_network_nodes(round_id,node_index,owner,front_id,a_access,b_access) SELECT ?,?,?,id,?,? FROM territory_war_v3_fronts WHERE round_id=? AND sequence=?`).bind(round.id,node.index,node.owner,node.a_access,node.b_access,round.id,node.index+1));}
  s.push(env.DB.prepare(`UPDATE territory_war_v3_rounds SET status=?,formed_at=CURRENT_TIMESTAMP,starts_at=?,ends_at=?,current_front_index=4,current_front_id=(SELECT front_id FROM territory_network_nodes WHERE round_id=? AND node_index=4),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,starts,ends,round.id,round.id),env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(token));
  return s;
}

export async function mutateNetworkRecruitment(env,round,statement){
  const token='NETWORK_ROSTER:'+crypto.randomUUID();
  return env.DB.batch([
    env.DB.prepare('UPDATE territory_war_v3_rounds SET version=version WHERE id=?').bind(round.id),
    env.DB.prepare(`INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM territory_war_v3_rounds WHERE id=? AND warfare_version=6 AND status='RECRUITING' AND datetime(recruitment_ends_at)>datetime('now')) THEN 1 ELSE 0 END`).bind(token,round.id),
    statement,
    env.DB.prepare('UPDATE territory_war_v3_rounds SET version=version+1 WHERE id=?').bind(round.id),
    env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(token)
  ]);
}

export async function networkView(env,round,side='',selectedIndex=4){
  if(!isNetworkWar(round))return null;
  const [state,result]=await Promise.all([
    env.DB.prepare('SELECT * FROM territory_network_rounds WHERE round_id=?').bind(round.id).first(),
    env.DB.prepare(`SELECT n.*,f.a_hp,f.b_hp,f.a_max_hp,f.b_max_hp,f.status,f.sequence FROM territory_network_nodes n LEFT JOIN territory_war_v3_fronts f ON f.id=n.front_id WHERE n.round_id=? ORDER BY n.node_index`).bind(round.id).all()
  ]);
  const stored=rows(result),control=networkControl(stored.length?stored:NETWORK_NODES);
  const nodes=control.nodes.map(node=>{const value=stored.find(r=>Number(r.node_index)===node.index);return {...node,...value,index:node.index,
    canEnter:Boolean(value&&side&&Number(value[side==='A'?'a_access':'b_access'])&&value.status==='ACTIVE'&&round.status==='ACTIVE'&&!state?.winner_side)};});
  const index=Number(selectedIndex),selected=nodes.find(n=>n.index===index)||nodes.find(n=>n.canEnter)||nodes[4];
  return {version:6,revision:Number(state?.revision||0),winner:state?.winner_side||'',nodes,edges:NETWORK_EDGES,counts:control.counts,selectedIndex:selected.index,selectedFrontId:Number(selected.front_id||0),canEnter:selected.canEnter,
    victory:'적 본진 점령 · 시간 종료 시 점령 거점 수, 동률이면 누적 공성 피해',allocation:'INDIVIDUAL'};
}
export async function networkFront(env,round,{frontId,nodeIndex}={}){
  if(!isNetworkWar(round))return null;
  if(frontId!=null&&(!Number.isSafeInteger(Number(frontId))||Number(frontId)<=0))return null;
  const condition=frontId!=null?'n.front_id=?':'n.node_index=?',value=frontId!=null?Number(frontId):Number(nodeIndex??4);
  return env.DB.prepare(`SELECT f.*,n.a_access,n.b_access FROM territory_network_nodes n JOIN territory_war_v3_fronts f ON f.id=n.front_id AND f.round_id=n.round_id WHERE n.round_id=? AND ${condition}`).bind(round.id,value).first();
}
export const frontRound=(round,front)=>isNetworkWar(round)&&front?{...round,current_front_id:front.id,current_front_index:front.node_index}:round;

export function networkActionGuards(env,{round,front,mine,requestId,access=true}){
  if(!isNetworkWar(round))return [];
  const side=mine?.side;if(access&&!['A','B'].includes(side))fail();
  const accessSql=access?` AND n.${side==='A'?'a_access':'b_access'}=1 AND EXISTS(SELECT 1 FROM territory_war_v3_users u WHERE u.round_id=r.id AND u.user_id=? AND u.side=? AND u.status='ACTIVE')`:'';
  return [env.DB.prepare('UPDATE territory_war_v3_rounds SET version=version WHERE id=?').bind(round.id),
    env.DB.prepare(`INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(
      SELECT 1 FROM territory_war_v3_rounds r JOIN territory_network_rounds m ON m.round_id=r.id JOIN territory_network_nodes n ON n.round_id=r.id JOIN territory_war_v3_fronts f ON f.id=n.front_id AND f.round_id=r.id
      WHERE r.id=? AND r.warfare_version=6 AND r.status='ACTIVE' AND r.settled_at IS NULL AND m.winner_side='' AND n.front_id=? AND f.status='ACTIVE' AND f.a_hp>0 AND f.b_hp>0
      AND datetime(r.ends_at)>datetime('now') AND (r.truce_ends_at IS NULL OR datetime(r.truce_ends_at)<=datetime('now'))${accessSql}) THEN 1 ELSE 0 END`).bind('NETWORK:'+requestId,round.id,front.id,...(access?[mine.user_id,side]:[]))];
}
export function networkActionCleanup(env,round,requestId){return isNetworkWar(round)?[env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind('NETWORK:'+requestId)]:[];}

export async function resolveNetworkNode(env,round,front,cfg){
  if(!isNetworkWar(round))return null;
  const winner=String(front.winner_side||'');if(front.status!=='RESOLVED'||!['A','B'].includes(winner))return null;
  for(let attempt=0;attempt<4;attempt++){
    const [map,currentRound,result]=await Promise.all([env.DB.prepare('SELECT * FROM territory_network_rounds WHERE round_id=?').bind(round.id).first(),env.DB.prepare('SELECT * FROM territory_war_v3_rounds WHERE id=?').bind(round.id).first(),env.DB.prepare('SELECT * FROM territory_network_nodes WHERE round_id=?').bind(round.id).all()]);
    const nodes=rows(result),node=nodes.find(n=>Number(n.node_index)===Number(front.node_index));
    if(!node||Number(node.front_id)!==Number(front.id)||map?.winner_side||currentRound?.status!=='ACTIVE')return {resolved:true,winner,roundWinner:map?.winner_side||'',roundFinished:Boolean(map?.winner_side),nextFront:null};
    const victory=(winner==='A'&&Number(node.node_index)===8)||(winner==='B'&&Number(node.node_index)===0);
    const control=networkControl(nodes.map(n=>Number(n.node_index)===Number(node.node_index)?{...n,owner:winner}:n)),nextSequence=Number(front.sequence)+9,token='NETWORK_RESOLVE:'+front.id;
    const s=[env.DB.prepare('UPDATE territory_war_v3_rounds SET version=version WHERE id=?').bind(round.id),
      env.DB.prepare(`INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM territory_network_rounds m JOIN territory_war_v3_rounds r ON r.id=m.round_id JOIN territory_network_nodes n ON n.round_id=m.round_id WHERE m.round_id=? AND m.revision=? AND m.winner_side='' AND r.status='ACTIVE' AND r.settled_at IS NULL AND n.front_id=?) THEN 1 ELSE 0 END`).bind(token,round.id,map.revision,front.id),
      env.DB.prepare(`INSERT INTO territory_war_v3_front_results(round_id,sequence,front_id,node_index,node_code,winner_side,a_damage,b_damage,a_hp_left,b_hp_left) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(round_id,sequence) DO NOTHING`).bind(round.id,front.sequence,front.id,front.node_index,front.node_code,winner,Number(front.a_max_hp)-Number(front.a_hp),Number(front.b_max_hp)-Number(front.b_hp),front.a_hp,front.b_hp),
      env.DB.prepare('UPDATE territory_network_nodes SET owner=?,captured_at=CURRENT_TIMESTAMP WHERE round_id=? AND node_index=?').bind(winner,round.id,node.node_index)];
    if(!victory){s.push(...frontStatements(env,{roundId:round.id,node:NETWORK_NODES[Number(node.node_index)],sequence:nextSequence,status:'ACTIVE',startsAt:new Date().toISOString(),cfg}),
      env.DB.prepare('UPDATE territory_network_nodes SET front_id=(SELECT id FROM territory_war_v3_fronts WHERE round_id=? AND sequence=?) WHERE round_id=? AND node_index=?').bind(round.id,nextSequence,round.id,node.node_index));}
    for(const n of control.nodes)s.push(env.DB.prepare('UPDATE territory_network_nodes SET a_access=?,b_access=? WHERE round_id=? AND node_index=?').bind(n.a_access,n.b_access,round.id,n.index));
    s.push(env.DB.prepare('UPDATE territory_network_rounds SET revision=revision+1,winner_side=? WHERE round_id=?').bind(victory?winner:'',round.id),
      env.DB.prepare(`UPDATE territory_war_v3_rounds SET current_front_id=(SELECT front_id FROM territory_network_nodes WHERE round_id=? AND node_index=4),a_front_wins=a_front_wins+?,b_front_wins=b_front_wins+?,version=version+1 WHERE id=?`).bind(round.id,winner==='A'?1:0,winner==='B'?1:0,round.id),
      env.DB.prepare(`INSERT INTO territory_war_v3_notices(round_id,type,side,title,message,payload_json) VALUES(?,'NETWORK_CAPTURE',?,?,?,?)`).bind(round.id,winner,node.owner===winner?'거점 방어 성공':'거점 점령',`${NETWORK_NODES[Number(node.node_index)].name} · ${node.owner===winner?'방어에 성공했습니다.':'진입 가능한 경로가 변경되었습니다.'}`,JSON.stringify({nodeIndex:Number(node.node_index),frontId:Number(front.id),owner:winner,defended:node.owner===winner})),
      env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(token));
    try{await env.DB.batch(s);return {resolved:true,winner,roundFinished:victory,nextFront:victory?null:await networkFront(env,round,{nodeIndex:node.node_index})};}
    catch(error){if(attempt===3)throw error;}
  }
}
export async function networkWinner(env,round){
  const map=await env.DB.prepare('SELECT winner_side FROM territory_network_rounds WHERE round_id=?').bind(round.id).first();
  if(map?.winner_side)return map.winner_side;
  return networkTimeWinner(rows(await env.DB.prepare('SELECT node_index,owner FROM territory_network_nodes WHERE round_id=?').bind(round.id).all()),round);
}

// Freeze the score under the same round lock used by attacks and captures.
// A stale read retries before generating any reward receipt.
export async function freezeNetworkWinner(env,round,forcedWinner='',adminJudgment=false){
  for(let attempt=0;attempt<4;attempt++){
    const fresh=await env.DB.prepare('SELECT * FROM territory_war_v3_rounds WHERE id=?').bind(round.id).first();
    const winner=forcedWinner||await networkWinner(env,fresh),token='NETWORK_SETTLE:'+round.id;
    try{
      await env.DB.batch([
        env.DB.prepare('UPDATE territory_war_v3_rounds SET version=version WHERE id=?').bind(round.id),
        env.DB.prepare(`INSERT INTO territory_war_mutation_guards(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM territory_war_v3_rounds WHERE id=? AND version=? AND settled_at IS NULL) THEN 1 ELSE 0 END`).bind(token,round.id,fresh.version),
        env.DB.prepare("UPDATE territory_network_rounds SET winner_side=? WHERE round_id=? AND (winner_side='' OR ?=1)").bind(winner,round.id,adminJudgment?1:0),
        env.DB.prepare('DELETE FROM territory_war_mutation_guards WHERE token=?').bind(token)
      ]);
      return networkWinner(env,fresh);
    }catch(error){if(attempt===3)throw error;}
  }
}
