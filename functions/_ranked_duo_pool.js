import {DUO_LIMITS} from '../shared/ranked-duo-v1.mjs';
import {duoRandomInt,shuffleDuo} from '../shared/ranked-duo-random-v4.mjs';

const p=env=>(sql,...args)=>env.DB.prepare(sql).bind(...args);
const stamp=now=>new Date(now).toISOString().replace('T',' ').slice(0,19);
// Use the same saved attack preset and defense deck as loadDuoProfiles.
// No enrollment, online-state or current season score is required.
const source=`FROM pvp_decks d JOIN users u ON u.id=d.user_id
 LEFT JOIN pvp_active_presets a ON a.user_id=d.user_id
 LEFT JOIN pvp_deck_presets pr ON pr.user_id=a.user_id AND pr.preset_no=a.preset_no`;
const attack=`CASE WHEN COALESCE(a.preset_no,1)=1 THEN COALESCE(pr.card_ids,d.card_ids) ELSE pr.card_ids END`;
const valid=column=>`CASE WHEN json_valid(${column}) THEN json_array_length(${column}) ELSE 0 END=5`;
const eligible=`u.status='ACTIVE' AND u.role<>'OWNER'
 AND (u.banned_until IS NULL OR SUBSTR(REPLACE(u.banned_until,'T',' '),1,19)<=?)
 AND ${valid('d.card_ids')} AND ${valid(attack)}`;

export async function rankedDuoPoolCount(env,now=Date.now()){
 return Number((await p(env)(`SELECT COUNT(*) AS n ${source} WHERE ${eligible}`,stamp(now)).first())?.n||0);
}
export async function rankedDuoPoolCandidates(env,userId,now){
 const q=p(env),where=`${eligible} AND d.user_id<>?`,args=[stamp(now),userId];
 const count=Number((await q(`SELECT COUNT(*) AS n ${source} WHERE ${where}`,...args).first())?.n||0);
 if(!count)return [];
 // A uniformly drawn circular window gives every saved deck a chance.
 // Only IDs are counted/scanned; at most 23 candidates leave the database.
 // Inventory/profile work remains in batches of at most 12 accounts.
 const size=Math.min(count,DUO_LIMITS.candidates-1),offset=duoRandomInt(count);
 const first=(await q(`SELECT d.user_id ${source} WHERE ${where} ORDER BY d.user_id LIMIT ? OFFSET ?`,...args,size,offset).all()).results;
 const rest=first.length<size?(await q(`SELECT d.user_id ${source} WHERE ${where} ORDER BY d.user_id LIMIT ?`,...args,size-first.length).all()).results:[];
 return shuffleDuo([...new Set([...first,...rest].map(r=>Number(r.user_id)))]);
}
export async function trackDuoProfileVersions(env,ids){
 // These rows only invalidate profile caches; they do not enroll, award or
 // consume energy for the offline accounts selected by another player.
 await env.DB.batch(ids.map(id=>p(env)('INSERT INTO ranked_duo_accounts_v1(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',id)));
}
