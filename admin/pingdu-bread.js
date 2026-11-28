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
  $('refresh').hidden = !selected;
  $('grant').hidden = !selected || !activity || activity.granted>=10000 || !(activity.posts>0 || (!activity.settledAt && activity.seconds>0)) || !config?.items.length;
  $('quantity').max=String(Math.max(1,10000-(activity?.granted || 0)));
  $('grantNote').textContent = selected && activity && !activity.settledAt && !config?.items.length ? '아래에서 개봉 아이템과 확률을 먼저 저장하세요.' : '';
  if (!activity) return;
  $('facts').replaceChildren();
  const facts = [['활동 날짜',day],['정산 대상 공개 글',postLabel(activity)],['씨나인 방송 합계',watchLabel(activity.seconds,activity.watchStatus)],['조회 시각', new Date(activity.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})]];
  if (activity.posts!=null) facts.push(['이번 집계 신규 글',count(activity.newPosts)+'건'],['앞서 집계한 미지급 글',count(activity.posts-activity.newPosts)+'건']);
  if (activity.settledAt) facts.push(['누적 지급',count(activity.granted)+'마리']);
  if (activity.legacyReview?.posts!=null) facts.push(['이전 방식 집계 기록',
    new Date(activity.legacyReview.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · '+count(activity.legacyReview.posts)+'건']);
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
    $('reviewNote').textContent = result.settledAt ? '추가 지급은 아직 보상에 반영되지 않은 공개 글로 정산합니다.' : '공개 글과 시청시간을 확인한 후 수량을 입력하세요.';
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
      const status = row.activity?.settledAt ? '누적 지급 '+count(row.activity.granted)+'마리' : row.activity ? '조회됨 · 정산 전' : '조회 전';
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
  event.preventDefault(); if (!selected || !activity || $('grant').hidden || paying) return;
  payment = { day, userId:selected.userId, revision:activity.revision, poolRevision:config.revision, quantity:Number($('quantity').value) };
  $('summary').textContent = day+' · '+selected.nickname+' (#'+selected.userId+')에게 붕어빵 '+count(payment.quantity)+'마리를 지급합니다. 이번 정산에 공개 글 '+count(activity.posts??0)+'건을 반영합니다.';
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
    await load(); $('grantNote').textContent = count(payment.quantity)+'마리를 지급했습니다.';
  } catch (error) { dialog.close(); $('grantNote').textContent = error.message+' 목록을 다시 조회하면 지급 여부를 확인할 수 있습니다.'; }
  finally { paying=false; payment=null; $('confirm').disabled=false; }
};
if (sessionToken(true)) { void load(true); void loadBatch(); }
else {
  const login = element('a','운영 대시보드에 로그인하세요.'); login.href='/admin/'; $('status').append(login);
}
