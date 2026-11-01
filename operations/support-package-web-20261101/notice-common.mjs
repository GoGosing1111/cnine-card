import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hash,counts} from '../verified-streamer-box2-messages-20261031/common.mjs';
const shared=new URL('../../shared/server-support-v1.mjs',import.meta.url);
const {supportAccountEligible,supportBenefits}=await import(fs.existsSync(shared)?shared:new URL('../../tmp/duo-settlement-recovery-20261027/shared/server-support-v1.mjs',import.meta.url));
export {hash,counts};
export const identities=rows=>rows.map(({userId,status,role,provider,identityHash,supportHash})=>({userId,status,role,provider,identityHash,supportHash}));
export async function eligible(db){
 const now=Number((await db.query('SELECT FLOOR(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)*1000)::text ms')).rows[0].ms);
 const rows=(await db.query(`SELECT u.id::text AS "userId",u.nickname,u.status,u.role,u.created_at,v.verified_at,v.provider,v.provider_user_id AS "providerId",m.value
 FROM app_meta m JOIN users u ON m.key='server_support_v1:'||u.id JOIN user_second_verifications v ON v.user_id=u.id WHERE u.status='ACTIVE' ORDER BY u.id`)).rows;
 return rows.filter(r=>supportAccountEligible(r,now)&&supportBenefits(JSON.parse(r.value),now).active).map(({providerId,value,created_at,verified_at,...r})=>{assert(r.provider&&providerId);return {...r,identityHash:hash({provider:r.provider,providerId}),supportHash:hash(value),passEndsAt:JSON.parse(value).endsAt};});
}
export const KEY='ops:support-package-pass-notice:20261101:v1';
export const ACTION='OPS_SUPPORT_PACKAGE_WEB_NOTICE_20261101';
export const TITLE='[웹 전용] 49,800원 패키지 1+1 · 11월 3일 00:00 판매 종료';
export const BODY=`49,800원 코인 패키지를 웹 브라우저에서만 구매할 수 있습니다.

패키지 1개 구성: 코인 200조 + 엠퍼러 에너지 200개 + SSS 리미티드 조각 5개
1회(49,800원) 신청 시 1+1 총 2개 지급: 코인 400조 + 엠퍼러 에너지 400개 + SSS 리미티드 조각 10개
5회·10회 빠른 선택 또는 직접 입력으로 한 번에 최대 100회까지 신청할 수 있습니다. 결제 금액과 지급량은 신청 횟수에 비례합니다.

구매 가능 기한: 2026년 11월 3일 00:00까지 (한국시간)
11월 2일에서 3일로 넘어가는 자정에 판매가 종료됩니다.

구매 경로: 웹 브라우저 접속 → [서버 안내] → [패키지 구매]
시즌패스 이용 기간이 활성화된 구매자만 신청할 수 있습니다. 앱에서는 구매할 수 없습니다.
패키지 코인은 승부예측에 사용할 수 없으며, 시즌패스 이용 기간은 연장되지 않습니다.`;
