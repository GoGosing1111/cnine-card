// CMS 운영 로그 표시 정책. 내부 지급 영수증/재화 원장은 변경하지 않는다.
// The account is fixed by ID so a later nickname change cannot expose old rows.
export const ADMIN_LOG_HIDDEN_ACCOUNT_ID=1;
export const ADMIN_LOG_HIDDEN_NICKNAME='\uD551\uD06C\uBE5B\uC720\uB450';
const operationMetadata=column=>{
 const text=key=>`UPPER(TRIM(COALESCE(json_extract(${column},'$.${key}'),'')))`;
 return `(CASE WHEN json_valid(${column}) THEN (
   ${text('actor')} IN ('CODEX','CODEX_OPERATIONS','SYSTEM_OPS')
   OR ${text('source')} IN ('CODEX','CODEX_OPERATIONS','SYSTEM_OPS')
   OR SUBSTR(${text('operationKey')},1,4)='OPS:'
 ) ELSE FALSE END)`;
};
export const ADMIN_LOG_VISIBLE_WHERE=`
 COALESCE(l.admin_id,0)<>?
 AND TRIM(COALESCE(u.nickname,''))<>?
 AND SUBSTR(UPPER(TRIM(COALESCE(l.action_type,''))),1,4)<>'OPS_'
 AND SUBSTR(UPPER(TRIM(COALESCE(l.action_type,''))),1,6)<>'CODEX_'
 AND NOT ${operationMetadata('l.before_data')}
 AND NOT ${operationMetadata('l.after_data')}`;
export const ADMIN_LOG_VISIBLE_PARAMS=Object.freeze([ADMIN_LOG_HIDDEN_ACCOUNT_ID,ADMIN_LOG_HIDDEN_NICKNAME]);
export const ADMIN_LOG_VISIBLE_QUERY=`SELECT l.*,u.nickname AS admin_nickname
 FROM admin_logs l LEFT JOIN users u ON u.id=l.admin_id
 WHERE ${ADMIN_LOG_VISIBLE_WHERE}
 ORDER BY l.id DESC LIMIT 300`;
export async function visibleAdminLogs(env){
 const rows=await env.DB.prepare(ADMIN_LOG_VISIBLE_QUERY).bind(...ADMIN_LOG_VISIBLE_PARAMS).all();
 return rows.results||[];
}
