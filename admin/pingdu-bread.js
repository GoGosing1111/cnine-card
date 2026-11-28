import {byId as $, count, element, initDate, memberOptions, postLabel, request, sessionToken, watchLabel} from '/events/pingdu-bread/client.js';
import {bindRewardEditor} from './pingdu-bread-pool.js';
import {bindBatch} from './pingdu-bread-batch.js';

const api = (path, options) => request(path, { ...options, admin: true });
const loadBatch = bindBatch(api,() => { clearSelection(); return load(); });
let page = 1, search = '', day, selected, activity, config, generation = 0, reviewVersion = 0, paying = false;
const controls = $('controls'), dialog = $('confirmation');
initDate($('day')); day = $('day').value;
const showEditor = bindRewardEditor(next => { config = next; renderActivity(); }, loadCatalog);
async function loadCatalog() {
  const data = await api('catalog');
  config = data.config; showEditor(data.catalog,config);
  memberOptions($('member'),data.members); renderActivity();
}
$('poolJump').onclick = () => { $('poolDetails').open = true; };
function renderActivity() {
  $('target').textContent = selected ? selected.nickname + ' · #' + selected.userId : '활동 기록 확인';
  $('facts').hidden = !activity; $('memberDetails').hidden = !selected;
  $('refresh').hidden = !selected || Boolean(activity?.settledAt);
  $('grant').hidden = !selected || !activity || Boolean(activity.settledAt) || !(activity.posts > 0 || activity.seconds > 0) || !config?.items.length;
  $('grantNote').textContent = selected && activity && !activity.settledAt && !config?.items.length ? '아래에서 개봉 아이템과 확률을 먼저 저장하세요.' : '';
  if (!activity) return;
  $('facts').replaceChildren();
  const facts = [['활동 날짜',day],['게시판 글 작성',postLabel(activity)],['씨나인 방송 합계',watchLabel(activity.seconds,activity.watchStatus)],['조회 시각', new Date(activity.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})]];
  if (activity.settledAt) facts.push(['지급 완료',count(activity.granted)+'마리']);
  for (const [name,value] of facts) $('facts').append(element('dt',name),element('dd',value));
}
function clearSelection() {
  ++reviewVersion; selected = activity = null;
  $('reviewNote').textContent = '목록에서 계정을 선택하세요.'; $('memberResult').textContent = '';
  $('quantity').value = ''; renderActivity();
}
async function inspect(row) {
  if (paying) return;
  const version = ++reviewVersion;
  selected = row; activity = row.activity; $('quantity').value = '';
  $('memberResult').textContent = ''; $('reviewNote').textContent = '활동을 조회하고 있습니다…'; renderActivity();
  $('grant').hidden = true; $('refresh').disabled = true;
  try {
    const result = await api('review',{body:{userId:row.userId,day}});
    if (version !== reviewVersion) return;
    activity = result; row.activity = result; renderActivity();
    $('reviewNote').textContent = result.settledAt ? '이 날짜의 정산을 완료했습니다.' : '게시글과 시청시간을 확인한 후 수량을 입력하세요.';
  } catch (error) {
    if (version === reviewVersion) { activity = null; renderActivity(); $('reviewNote').textContent = error.message; }
  } finally { if (version === reviewVersion) $('refresh').disabled = false; }
}
async function load(resetConfig = false) {
  const version = ++generation;
  $('status').textContent = '계정 목록을 불러오는 중입니다…';
  try {
    const [result] = await Promise.all([api('accounts',{query:{day,page,search}}), (resetConfig || !config) ? loadCatalog() : undefined]);
    if (version !== generation) return;
    controls.hidden = false; $('status').textContent = '';
    if (!config.items.length) $('poolDetails').open = true;
    const rows = result.rows.map(row => {
      const li = element('li'), description = element('div');
      const status = row.activity?.settledAt ? '지급 완료 '+count(row.activity.granted)+'마리' : row.activity ? '조회됨 · 정산 전' : '조회 전';
      description.append(element('b',row.nickname),element('small','#'+row.userId+' · '+status));
      const button = element('button','기록 확인'); button.type = 'button'; button.setAttribute('aria-label',row.nickname+' 기록 확인');
      button.onclick = () => inspect(row); li.append(description,button); return li;
    });
    $('accounts').replaceChildren(...(rows.length ? rows : [element('li','해당 계정이 없습니다.')]));
    $('prev').disabled = page <= 1; $('next').disabled = !result.more; $('page').textContent = page+'쪽';
    renderActivity();
  } catch (error) {
    if (version !== generation) return;
    $('status').textContent = error.message+' ';
    if (!controls.hidden) return;
    const back = element('a', '운영 대시보드 로그인'); back.href='/admin/'; $('status').append(back);
  }
}
$('filters').onsubmit = event => {
  event.preventDefault(); day = $('day').value; search = $('search').value.trim(); page = 1; clearSelection(); void load();
};
$('day').onchange = () => { if ($('day').validity.valid) $('filters').requestSubmit(); };
$('prev').onclick = () => { if (page > 1) { --page; clearSelection(); void load(); } };
$('next').onclick = () => { ++page; clearSelection(); void load(); };
$('refresh').onclick = () => { if (selected) void inspect(selected); };
$('member').onchange = () => { $('memberResult').textContent = ''; };
$('memberCheck').onclick = async () => {
  const version = reviewVersion, memberId = $('member').value;
  $('memberCheck').disabled = true; $('memberResult').textContent = '조회 중…';
  try {
    const result = await api('member',{body:{day,userId:selected.userId,memberId}});
    if (version === reviewVersion && memberId === $('member').value) $('memberResult').textContent = result.member+' · '+watchLabel(result.seconds,result.status);
  } catch (error) { if (version === reviewVersion) $('memberResult').textContent = error.message; }
  finally { $('memberCheck').disabled = false; }
};
let payment;
$('grant').onsubmit = event => {
  event.preventDefault(); if (!selected || !activity || activity.settledAt || paying) return;
  payment = { day, userId:selected.userId, revision:activity.revision, poolRevision:config.revision, quantity:Number($('quantity').value) };
  $('summary').textContent = day+' · '+selected.nickname+' (#'+selected.userId+')에게 붕어빵 '+count(payment.quantity)+'마리를 지급합니다. 이 날짜의 정산이 확정됩니다.';
  dialog.showModal(); $('cancel').focus();
};
$('cancel').onclick = () => { if (!paying) dialog.close(); };
dialog.addEventListener('cancel', event => { if (paying) event.preventDefault(); });
$('confirm').onclick = async () => {
  if (!payment || paying) return;
  paying = true; $('confirm').disabled = true;
  try {
    const result = await api('settle',{body:payment});
    activity = result; selected.activity = result; renderActivity();
    $('reviewNote').textContent = '지급을 완료했습니다.'; dialog.close();
    await load(); $('grantNote').textContent = count(result.granted)+'마리를 지급했습니다.';
  } catch (error) { dialog.close(); $('grantNote').textContent = error.message+' 목록을 다시 조회하면 지급 여부를 확인할 수 있습니다.'; }
  finally { paying=false; payment=null; $('confirm').disabled=false; }
};
if (sessionToken(true)) { void load(true); void loadBatch(); }
else {
  const login = element('a','운영 대시보드에 로그인하세요.'); login.href='/admin/'; $('status').append(login);
}
