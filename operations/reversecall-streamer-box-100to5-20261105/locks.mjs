import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {unstable_dev} from 'wrangler';
export async function accountLocks(db,ids,operationKey){
  const token=randomBytes(32).toString('hex'),chunks=Math.ceil(ids.length/20);
  let server,deadline=0,heartbeat,lost=false,pending=false,heartbeatError=null;
  const remote=async action=>{
    const replies=await Promise.all(Array.from({length:chunks},async(_,index)=>{
      let body;
      for(let attempt=0;attempt<(action==='acquire'?12:1);attempt++){
        const response=await fetch(`http://127.0.0.1:${server.port}/${action}/${index}`,{method:'POST',headers:{'x-ops-key':token},signal:AbortSignal.timeout(45000)});body=await response.json();assert(response.ok,body.error||'Lock service unavailable');
        if(action!=='acquire'||body.acquired)break;
        await new Promise(resolve=>setTimeout(resolve,350));
      }
      if(action==='acquire')assert(body.acquired,'Account still busy: '+body.busyIds?.join(','));return body;
    }));
    return {owned:replies.reduce((sum,row)=>sum+(row.owned||0),0),count:replies.reduce((sum,row)=>sum+(row.count||0),0),deadline:Math.min(...replies.map(row=>row.leaseUntil||0))};
  };
  const release=async()=>{
    clearInterval(heartbeat);
    try{
      if(server){
        await db.query('DELETE FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[ids,token]);
        await remote('release');assert.equal((await remote('state')).owned,0);
        assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2',[ids,token])).rowCount,0);
      }
    }finally{if(server)await server.stop();}
  };
  try{
    server=await unstable_dev(fileURLToPath(new URL('./lock-worker.mjs',import.meta.url)),{config:fileURLToPath(new URL('./wrangler.jsonc',import.meta.url)),local:false,ip:'127.0.0.1',port:0,inspectorPort:0,logLevel:'error',vars:{OPS_KEY:token,OPS_EXPIRES_AT:String(Date.now()+900000)},experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false,watch:false}});
    const acquired=await remote('acquire');assert.equal(acquired.count,ids.length);deadline=acquired.deadline;
    assert.equal((await remote('state')).owned,ids.length);
    assert.equal((await db.query(`INSERT INTO user_mutation_locks_v1520(user_id,token,action_path,lease_until_ms,updated_at)
      SELECT id,$2,$3,$4,CURRENT_TIMESTAMP FROM unnest($1::bigint[]) ids(id) ORDER BY id
      ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,action_path=excluded.action_path,lease_until_ms=excluded.lease_until_ms,updated_at=CURRENT_TIMESTAMP
      WHERE user_mutation_locks_v1520.lease_until_ms<=$5 RETURNING user_id`,[ids,token,operationKey,deadline,Date.now()])).rowCount,ids.length);
    heartbeat=setInterval(()=>{if(pending)return;pending=true;remote('state').then(state=>{if(state.owned!==ids.length){lost=true;console.log(JSON.stringify({stage:'ACCOUNT_LOCK_STATE_MISMATCH',owned:state.owned,expected:ids.length,remainingMs:deadline-Date.now()}));}}).catch(error=>{heartbeatError=String(error.message);lost=true;console.log(JSON.stringify({stage:'ACCOUNT_LOCK_STATE_ERROR',error:heartbeatError,remainingMs:deadline-Date.now()}));}).finally(()=>{pending=false;});},2000);
    console.log(JSON.stringify({stage:'ACCOUNT_LOCKS_ACQUIRED',count:ids.length,remainingMs:deadline-Date.now()}));
    return {token,lockDeadline:deadline,release,check(){assert(!lost,heartbeatError?'Account lease state unavailable: '+heartbeatError:'Account lease lost');assert(deadline>Date.now()+5000,'Account lease expired');},async assertOwned(){this.check();assert.equal((await remote('state')).owned,ids.length);assert.equal((await db.query('SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4 FOR UPDATE',[ids,token,operationKey,Date.now()+3000])).rowCount,ids.length);}};
  }catch(error){await release();throw error;}
}
