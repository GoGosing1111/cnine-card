// Explicit user instruction: register the supplied success video and open ICON fusion.
// Only settings + an idempotent operations receipt are written. No player transactions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {ICON_LIVE_CARDS,ICON_FUSION_POLICY,ICON_FUSION_SETTINGS_KEY,validateIconVideoUrl} from '../../shared/icon-fusion-policy-v1.mjs';

export const RECEIPT_KEY='icon_fusion_video_open_20261006_v1';
export const VIDEO={url:'/assets/videos/icon/icon-fusion-success-20261006.mp4',durationMs:10005,bytes:7525823,sha256:'41efa5f11c861741425eabb5a69e48d63177c6b6494be9d6efa59ea4e20c7f78',width:720,height:1280};
export const VIDEO_LIMIT_MS=11000; // CMS edits this maximum in whole seconds.
const hash=data=>createHash('sha256').update(data).digest('hex');
const json=value=>typeof value==='string'?JSON.parse(value):value;
const matches=settings=>settings.enabled===true&&settings.successVideoUrl===VIDEO.url&&settings.successVideoDurationMs===VIDEO_LIMIT_MS;

export async function inspect(client){
 const rows=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[ICON_FUSION_SETTINGS_KEY,RECEIPT_KEY]])).rows;
 return Object.fromEntries(rows.map(r=>[r.key,json(r.value)]));
}
export async function apply(client,{dryRun=true,expectedRevision=2}={}){
 assert.equal(validateIconVideoUrl(VIDEO.url),VIDEO.url);
 const local=fs.readFileSync(new URL('../../'+VIDEO.url.slice(1),import.meta.url));
 assert.equal(local.length,VIDEO.bytes);assert.equal(hash(local),VIDEO.sha256);
 let published=null;
 if(!dryRun){
  const response=await fetch('https://cnine-card.pages.dev'+VIDEO.url,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'Publish the approved video before opening fusion');
  assert.match(response.headers.get('content-type')||'',/^video\/mp4/i);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,VIDEO.bytes);assert.equal(hash(bytes),VIDEO.sha256);
  published={url:response.url,status:response.status,contentType:response.headers.get('content-type'),sha256:hash(bytes),checkedAt:new Date().toISOString()};
 }
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('icon-fusion-video-open-20261006-v1'))");
  const row=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[ICON_FUSION_SETTINGS_KEY])).rows[0];
  assert.ok(row,'Expected existing ICON fusion settings');const before=json(row.value);
  const existing=(await client.query('SELECT value FROM app_meta WHERE key=$1',[RECEIPT_KEY])).rows[0];
  if(existing){assert.ok(matches(before),'Completed release settings have since changed; do not overwrite');await client.query('COMMIT');return {dryRun,replayed:true,receipt:json(existing.value),settings:before};}
  assert.equal(before.revision,expectedRevision,'Settings changed; inspect before retry');
  assert.equal(before.enabled,false,'Expected the final-review lock');
  assert.equal(before.successVideoUrl,'','An unexpected video is already registered');
  const ids=ICON_LIVE_CARDS.map(c=>c.cardId);
  const cards=(await client.query("SELECT c.id FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=ANY($1::text[]) AND c.rarity='ICON' AND c.base_power=180000 AND c.is_active=1 AND m.is_active=1 AND c.card_status='PUBLIC' ORDER BY c.id",[ids])).rows;
  assert.deepEqual(cards.map(c=>c.id),[...ids].sort(),'All seven ICONs must remain public');
  const now=new Date().toISOString();
  const after={...before,revision:before.revision+1,enabled:true,successVideoUrl:VIDEO.url,successVideoDurationMs:VIDEO_LIMIT_MS,policy:{...ICON_FUSION_POLICY},reviewStatus:'OPEN',approvedAt:now,approval:'USER_EXPLICIT_VIDEO_AND_OPEN_20261006',requestId:'icon-video-open-20261006-v1',updatedAt:now,updatedBy:'USER_INSTRUCTION_CODEX'};
  const result=await client.query('UPDATE app_meta SET value=$1,updated_at=sqlite_now() WHERE key=$2 AND value=$3 RETURNING key',[JSON.stringify(after),ICON_FUSION_SETTINGS_KEY,row.value]);
  assert.equal(result.rows.length,1,'Concurrent settings update');
  const receipt={operation:RECEIPT_KEY,authorization:'User: 영상 이거로 등록하고 아이콘 개방 해',createdAt:now,video:VIDEO,published,before,after,ownershipWrites:0,currencyWrites:0};
  const saved=await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now()) RETURNING key',[RECEIPT_KEY,JSON.stringify(receipt)]);
  assert.equal(saved.rows.length,1);assert.ok(matches((await inspect(client))[ICON_FUSION_SETTINGS_KEY]));
  await client.query(dryRun?'ROLLBACK':'COMMIT');
  return {dryRun,replayed:false,receipt,settings:after};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
