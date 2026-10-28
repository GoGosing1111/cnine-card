export class SoopWatchError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const invalid = message => { throw new SoopWatchError('SOOP_WATCH_INVALID', message); };
export function validSoopId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\s\u0000-\u001f\u007f]/u.test(value);
}
function ids(value, maximum, label) {
  if (!Array.isArray(value) || !value.length || value.length > maximum || value.some(id => !validSoopId(id))) invalid(`${label} 목록을 확인하세요.`);
  return [...new Set(value)];
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('집계 날짜를 확인하세요.');
  const parsed = new Date(value+'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) invalid('집계 날짜를 확인하세요.');
  return parsed;
}
export function normalizeWatchRequest(input = {}) {
  const userSoopIds = ids(input.userSoopIds, 1000, '사용자'), streamerIds = ids(input.streamerIds, 50, '방송');
  const start = date(input.dateGte), end = date(input.dateLt), maximum = new Date(start);
  // Calendar-month limit, clamped to the last day of the destination month.
  maximum.setUTCDate(1); maximum.setUTCMonth(maximum.getUTCMonth()+3);
  const lastDay = new Date(Date.UTC(maximum.getUTCFullYear(),maximum.getUTCMonth()+1,0)).getUTCDate();
  maximum.setUTCDate(Math.min(start.getUTCDate(),lastDay));
  if (end <= start || end > maximum) invalid('집계 기간은 시작일 포함·종료일 제외, 최대 3개월입니다.');
  const page = input.pagination?.page ?? 1, size = input.pagination?.size ?? 100;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 200) invalid('랭킹 페이지를 확인하세요.');
  return {userSoopIds,streamerIds,dateGte:input.dateGte,dateLt:input.dateLt,pagination:{page,size},includeStreamerRankings:false};
}
export function validateWatchResponse(body, request) {
  const fail = () => { throw new SoopWatchError('SOOP_WATCH_BAD_RESPONSE','DK 시청시간 응답을 검증하지 못했습니다.',502); };
  const ranking = body?.ranking, {page,size} = request.pagination, total = request.userSoopIds.length;
  if (body?.dateGte !== request.dateGte || body?.dateLt !== request.dateLt || typeof body?.generatedAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(body.generatedAt) || !Number.isFinite(Date.parse(body.generatedAt))) fail();
  if (!ranking || ranking.total !== total || ranking.page !== page || ranking.size !== size || !Array.isArray(ranking.data) || ranking.data.length !== Math.max(0,Math.min(size,total-(page-1)*size)) || ranking.more !== (page*size < total)) fail();
  const allowed = new Set(request.userSoopIds), seen = new Set();
  let previous;
  const data = ranking.data.map((row,index) => {
    const position = (page-1)*size+index+1;
    if (!allowed.has(row?.soopUserId) || seen.has(row.soopUserId) || !Number.isSafeInteger(row.watchSeconds) || row.watchSeconds < 0 || row.position !== position || !Number.isSafeInteger(row.rank) || row.rank < 1 || row.rank > position) fail();
    if (position === 1 && row.rank !== 1) fail();
    if (previous && (row.watchSeconds > previous.watchSeconds || (row.watchSeconds === previous.watchSeconds ? row.rank !== previous.rank : row.rank !== position))) fail();
    seen.add(row.soopUserId); previous = row;
    return {soopUserId:row.soopUserId,watchSeconds:row.watchSeconds,position,rank:row.rank};
  });
  return {dateGte:body.dateGte,dateLt:body.dateLt,generatedAt:body.generatedAt,ranking:{data,total,page,size,more:ranking.more}};
}
export function watchMonthPeriod(month, now = Date.now()) {
  const current = new Date(now+9*3600000).toISOString().slice(0,7);
  month = month || current;
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || month > current) invalid('현재 월 또는 지난 월을 선택하세요.');
  const [year,number] = month.split('-').map(Number);
  return {month,dateGte:month+'-01',dateLt:new Date(Date.UTC(year,number,1)).toISOString().slice(0,10),timezone:'Asia/Seoul',monthInProgress:month===current};
}
