import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {reconcileClanDraft} from '../../../functions/_clan.js';

// A minute cron starts drafts without viewers; within that minute, wake at each deadline.
// Requests and this scheduler share the same DB lock and deadline-based catch-up.
export async function runDraftSchedule(env,{openDatabase=createPostgresD1Compat,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),reconcile=reconcileClanDraft}={}){
  const until=now()+60000;
  for(let iteration=0;iteration<12;iteration++){
    let connection,result;
    try{
      connection=await openDatabase(env.HYPERDRIVE?.connectionString);
      result=await reconcile({...env,DB:connection.db});
      await connection.db.prepare("INSERT INTO app_meta(key,value,updated_at) VALUES('clan_draft_scheduler_v1',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify({version:'20260915-30s',checkedAt:new Date(now()).toISOString(),...result})).run();
    }finally{await connection?.close()}
    const next=Date.parse(result.nextCheckAt||'');
    if(!Number.isFinite(next)||next>until)return result;
    const delay=next>now()?next-now():5000;
    if(now()+delay>until)return result;
    await sleep(delay);
  }
}

export default{
  async scheduled(_controller,env,ctx){ctx.waitUntil(runDraftSchedule(env))},
  async fetch(){return new Response('Not found',{status:404})}
};
