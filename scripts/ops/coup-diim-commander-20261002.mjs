export const COUP_COMMAND_OPERATION='ops:coup-diim-commander:20261002:v1';
export const COUP_TARGET_ROUND='6a9e2006-6396-4037-b694-15cf5a37143b';
export const COUP_TARGET_COMMANDER=4773;
export const COUP_EXPECTED_APPOINTMENT='7497d6d5-51f8-4b18-a545-0f57bebddfd5';

// Caller provides a short transaction; dry-run uses the same code then ROLLBACK.
export async function assignCoupCommander(client,{releaseCommit}={}){
 if(!/^[a-f0-9]{40}$/.test(releaseCommit||''))throw Error('A verified deployed release commit is required');
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const [identity]=await q('SELECT current_database() AS database,pg_is_in_recovery() AS replica');
 if(identity.database!=='cnine'||identity.replica)throw Error('Wrong database');
 await q("SELECT key FROM app_meta WHERE key IN ('chief_appointment_v1','coup_settings_v2115') ORDER BY key FOR UPDATE");
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[COUP_COMMAND_OPERATION]);
 if(prior)return{ok:true,changed:false,receipt:JSON.parse(prior.value)};
 const [owner]=await q("SELECT id,role,status FROM users WHERE id=1");
 if(owner?.role!=='OWNER'||owner.status!=='ACTIVE')throw Error('Operational owner changed');
 const [round]=await q('SELECT * FROM coup_rounds_v2115 WHERE id=$1 FOR UPDATE',[COUP_TARGET_ROUND]);
 if(!round||round.status!=='RECRUITING'||Number(round.chief_user_id)!==4977||round.appointment_id!==COUP_EXPECTED_APPOINTMENT||round.starts_at!=null)throw Error('Recruiting round identity or state changed');
 const [appointmentRow]=await q("SELECT value FROM app_meta WHERE key='chief_appointment_v1'");
 const appointment=JSON.parse(appointmentRow?.value||'{}');
 if(appointment.id!==COUP_EXPECTED_APPOINTMENT||Number(appointment.userId)!==4977||Date.parse(appointment.endsAt)<=Date.now())throw Error('Chief appointment changed');
 const users=await q('SELECT id,nickname,status FROM users WHERE nickname=$1 ORDER BY id FOR UPDATE',['진짜디임']);
 if(users.length!==1||Number(users[0].id)!==COUP_TARGET_COMMANDER||users[0].status!=='ACTIVE')throw Error('Commander identity changed');
 const [member]=await q('SELECT side FROM coup_participants_v2115 WHERE round_id=$1 AND user_id=$2',[COUP_TARGET_ROUND,COUP_TARGET_COMMANDER]);
 if(member&&member.side!=='REBEL')throw Error('Commander is already enlisted on the other side');
 const [activity]=await q('SELECT COUNT(*)::int AS count FROM coup_attacks_v2115 WHERE round_id=$1',[COUP_TARGET_ROUND]);
 if(activity.count!==0)throw Error('Round already has combat activity');
 const before=JSON.parse(round.settings_json),after={...before,rebelCommand:{roundId:COUP_TARGET_ROUND,userId:COUP_TARGET_COMMANDER}};
 const changed=await q('UPDATE coup_rounds_v2115 SET settings_json=$1,revision=revision+1 WHERE id=$2 AND revision=$3 AND status=\'RECRUITING\' RETURNING revision',[JSON.stringify(after),COUP_TARGET_ROUND,round.revision]);
 if(changed.length!==1)throw Error('Concurrent round update');
 const receipt={operationKey:COUP_COMMAND_OPERATION,roundId:COUP_TARGET_ROUND,commanderId:COUP_TARGET_COMMANDER,commanderName:'진짜디임',enrolled:member?.side==='REBEL',before,after,revision:Number(changed[0].revision),releaseCommit,completedAt:new Date().toISOString(),openingDisplay:'2026-10-02 23:00 Asia/Seoul',automaticStartConfigured:false};
 const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,'COUP_REBEL_COMMANDER_ASSIGN','COUP',$1,$2,$3,sqlite_now()) RETURNING id",[COUP_TARGET_ROUND,JSON.stringify(before),JSON.stringify(receipt)]);
 receipt.auditId=Number(audit.id);
 await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[COUP_COMMAND_OPERATION,JSON.stringify(receipt)]);
 return{ok:true,changed:true,receipt};
}
