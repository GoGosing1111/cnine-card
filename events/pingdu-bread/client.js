export const byId = id => document.getElementById(id);
export const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
export const count = value => Number(value).toLocaleString('ko-KR');
export const sourceLabel = status => ({ UNLINKED: '연동 필요', UNAVAILABLE: '조회 실패' }[status] || '미조회');
export function watchLabel(seconds, status) {
  if (seconds == null) return sourceLabel(status);
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  if (!hours && !minutes) return seconds + '초';
  return (hours ? count(hours) + '시간 ' : '') + minutes + '분';
}
export function postLabel(activity) {
  return activity?.posts == null ? sourceLabel(activity?.boardStatus) : count(activity.posts) + '건';
}
export function sessionToken(admin = false) {
  const keys = admin ? ['cnine_admin_token', 'cnine_card_api_token'] : ['cnine_card_api_token'];
  try {
    for (const key of keys) {
      const token = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (token) return token;
    }
  } catch { /* Anonymous preview is also available. */ }
  return '';
}
export async function request(action, { admin = false, body, query } = {}) {
  const prefix = admin ? 'admin' : 'events';
  const url = new URL('/api/' + prefix + '/pingdu-bread/' + action, location.origin);
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value);
  const token = sessionToken(admin);
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(admin && action==='batch-pay' ? 120000 : 30000),
    headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw Object.assign(new Error(result.error || '서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.'), { status: response.status });
  }
  return result;
}
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function memberOptions(select, members) {
  select.replaceChildren(...members.map(member => new Option(member.name, member.id)));
}
export function initDate(input) { input.value = input.max = today(); }
