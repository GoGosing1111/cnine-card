import {byId as $, count, element, initDate, memberOptions, postLabel, request, sessionToken, today, watchLabel} from './client.js';
import {percent, rewardAmount} from '/shared/pingdu-bread-odds.mjs';

const demoItem = {name:'마스터의 별', quantity:1, image:'/assets/ui/icon-fusion-20261004/master-star.webp'};
let state, activity, generation = 0, lookupBusy = false;
let demo = false, busy = false, revealed = false, gestureX = null;
const inStore = location.pathname.startsWith('/onestore/');
const dialog = $('opening');
initDate($('day'));
$('todayLabel').textContent = today().replaceAll('-', '.') + ' · 한국시간';

function pendingKey() { return 'pingdu.bread.open:' + state.userId; }
function pending() { return state && localStorage.getItem(pendingKey()); }
function setOpenControls() {
  let canRecover = false;
  try { canRecover = Boolean(pending()); } catch { /* Show the normal balance. */ }
  $('openBread').disabled = busy || !state || (!state.balance && !canRecover);
  $('openBread').textContent = canRecover ? '이전 개봉 결과 확인' : '붕어빵 뜯기';
}
function paintActivity() {
  $('dayStatus').textContent = activity?.settledAt ? (activity.posts>0?'추가 정산 대기':'지급 완료') : activity ? '정산 전' : state ? '조회 전' : '로그인 전';
  $('dayStatus').classList.toggle('paid', Boolean(activity?.settledAt));
  $('posts').textContent = activity ? postLabel(activity) : '—';
  $('seconds').textContent = activity ? watchLabel(activity.seconds, activity.watchStatus) : '—';
  $('review').hidden = !state;
  $('memberDetails').hidden = !state;
  $('consentLink').hidden = !state || activity?.watchStatus !== 'UNLINKED';
  if (!state) return;
  if (activity?.settledAt) $('recordNote').textContent = '이 날짜에 붕어빵 총 ' + count(activity.granted) + '마리를 받았어요. 기록을 조회하면 추가 정산할 공개 글을 확인할 수 있어요.';
  else if (!activity) $('recordNote').textContent = '기록 조회를 눌러 선택한 날짜의 활동을 확인하세요.';
  else if (activity.boardStatus === 'UNAVAILABLE' || activity.watchStatus === 'UNAVAILABLE') $('recordNote').textContent = '일부 기록을 불러오지 못했어요. 잠시 후 다시 조회하세요.';
  else if (activity.boardStatus === 'UNLINKED' || activity.watchStatus === 'UNLINKED') $('recordNote').textContent = 'PLAY DK 2차 인증과 SOOP 시청정보 제공 동의를 확인하세요.';
  else $('recordNote').textContent = '집계 기준 ' + new Date(activity.checkedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) + ' · 운영자 정산 대기';
}
function list(parent, values, rowText, empty) {
  if (!values.length) { parent.append(element('p', empty)); return; }
  const ul = element('ul', null, 'history-list');
  for (const value of values) {
    const li = element('li');
    for (const text of rowText(value)) li.append(element('span', text));
    ul.append(li);
  }
  parent.append(ul);
}
function paintRewards(items) {
  const rewards = $('rewards');
  rewards.replaceChildren();
  list(rewards, items.filter(item => (item.units ?? item.chance) > 0), item => [item.name, rewardAmount(item.quantity) + (item.code==='COIN' ? ' 코인' : '개') + ' · ' + percent(item.units ?? item.chance * 10000) + '%'], '운영자가 개봉 아이템을 준비하고 있어요.');
}
$('rewardDetails').addEventListener('toggle', async () => {
  if (!$('rewardDetails').open || state) return;
  try {
    const {items} = await request('rewards');
    if (!state) paintRewards(items);
  } catch (error) { if (!state) $('rewards').textContent = error.message; }
});
function paintDetails() {
  const history = $('history');
  history.replaceChildren(); paintRewards(state.items);
  history.append(element('strong','붕어빵 지급'));
  list(history, state.grants, row => [row.day, count(row.quantity) + '마리'], '아직 지급 내역이 없어요.');
  history.append(element('strong','최근 개봉'));
  list(history, state.history, row => [row.reward.name + ' × ' + rewardAmount(row.reward.quantity), new Date(row.openedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})], '아직 개봉 내역이 없어요.');
}
function setState(next) {
  state = next; activity = state.day;
  $('loginLink').hidden = true;
  $('adminLink').hidden = !state.owner || inStore;
  $('balance').textContent = count(state.balance);
  $('bagNote').textContent = state.balance ? '한 번 뜯을 때마다 한 마리를 사용해요.' : '정산된 붕어빵이 생기면 여기에서 뜯을 수 있어요.';
  if (state.boardSlugs?.length) $('boardLink').href = 'https://www.playdk.kr/board/' + encodeURIComponent(state.boardSlugs[0]);
  const selectedMember = $('member').value;
  memberOptions($('member'), state.members);
  if (state.members.some(member => member.id === selectedMember)) $('member').value = selectedMember;
  $('station').href = 'https://www.sooplive.com/station/' + encodeURIComponent($('member').value);
  paintActivity(); setOpenControls(); paintDetails();
}
async function loadDay() {
  const current = ++generation, date = $('day').value;
  $('memberResult').textContent = '';
  if (!date) return;
  if (!sessionToken()) { paintActivity(); return; }
  $('review').hidden = false; $('review').disabled = true;
  try {
    const next = await request('state', {query:{day:date}});
    if (generation === current) setState(next);
  } catch (error) {
    if (generation !== current) return;
    if (state) { activity = null; paintActivity(); }
    $('recordNote').textContent = error.message;
    $('loginLink').hidden = error.status !== 401;
    $('review').hidden = false;
  } finally { if (generation === current) $('review').disabled = false; }
}
$('review').onclick = async () => {
  if (!state) { await loadDay(); return; }
  if (lookupBusy) return;
  const current = generation;
  lookupBusy = true; $('review').disabled = true; $('recordNote').textContent = 'PLAY DK 활동 기록을 확인하고 있어요…';
  try {
    const result = await request('review', {body:{day:$('day').value}});
    if (current === generation) { activity = result; paintActivity(); }
  } catch (error) { if (current === generation) $('recordNote').textContent = error.message; }
  finally { lookupBusy = false; $('review').disabled = false; }
};
$('day').onchange = loadDay;
$('member').onchange = () => {
  $('memberResult').textContent = '';
  $('station').href = 'https://www.sooplive.com/station/' + encodeURIComponent($('member').value);
};
$('memberCheck').onclick = async () => {
  const memberId = $('member').value, day = $('day').value;
  $('memberCheck').disabled = true; $('memberResult').textContent = '시청시간 조회 중…';
  try {
    const result = await request('member', {body:{day, memberId}});
    if (day === $('day').value && memberId === $('member').value) $('memberResult').textContent = result.member + ' · ' + watchLabel(result.seconds, result.status);
  } catch (error) { if (day === $('day').value) $('memberResult').textContent = error.message; }
  finally { $('memberCheck').disabled = false; }
};

for (let i = 0; i < 10; i++) {
  const crumb = element('i');
  crumb.style.setProperty('--tx', (Math.cos(i * 2.4) * (47 + i * 6)).toFixed(1) + 'px');
  crumb.style.setProperty('--ty', (Math.sin(i * 2.4) * 46 + 16).toFixed(1) + 'px');
  $('tearStage').querySelector('.crumbs').append(crumb);
}
function begin(sample) {
  if (busy || dialog.open) return;
  demo = sample; revealed = false; gestureX = null;
  $('tearStage').classList.remove('cracked'); $('prizeImg').hidden = true;
  $('openMode').textContent = demo ? '개봉 체험 · 예시 아이템' : '내 붕어빵 봉투';
  $('openTitle').textContent = '붕어빵을 뜯어 보세요';
  $('openText').textContent = demo ? '옆으로 밀거나 아래 버튼을 눌러 연출을 체험하세요.' : '옆으로 밀거나 버튼을 누르면 붕어빵 한 마리를 개봉해요.';
  $('tearButton').textContent = '붕어빵 뜯기'; $('tearButton').disabled = false;
  dialog.showModal(); $('tearButton').focus();
}
async function tear() {
  if (busy || !dialog.open) return;
  if (revealed) { dialog.close(); return; }
  busy = true; setOpenControls(); $('tearButton').disabled = true;
  try {
    let item = demoItem;
    if (!demo) {
      const id = pending() || crypto.randomUUID();
      localStorage.setItem(pendingKey(), id);
      $('openText').textContent = '개봉 결과를 확인하고 있어요…';
      let result;
      try { result = await request('open', {body:{requestId:id}}); }
      catch (error) {
        if ([400,401,403,409].includes(error.status)) localStorage.removeItem(pendingKey());
        throw error;
      }
      localStorage.removeItem(pendingKey());
      state.balance = result.balance; $('balance').textContent = count(result.balance);
      item = result.reward;
      state.history = [result, ...state.history.filter(row => row.requestId !== id)].slice(0,20);
      paintDetails();
    }
    $('prizeImg').src = item.image; $('prizeImg').hidden = false;
    $('tearStage').classList.add('cracked');
    await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 710));
    revealed = true;
    $('openTitle').textContent = item.name + ' × ' + rewardAmount(item.quantity);
    $('openText').textContent = demo ? '체험용 개봉 결과예요.' : item.code === 'COIN' ? '일반 코인을 지갑에 적립했어요.' : '아이템을 인벤토리에 담았어요.';
    $('tearButton').textContent = '확인';
  } catch (error) {
    $('openText').textContent = error.message || '같은 개봉 결과를 다시 확인하세요.';
    $('tearButton').textContent = '다시 확인';
  } finally { busy = false; $('tearButton').disabled = false; setOpenControls(); }
}
$('demo').onclick = () => begin(true); $('openBread').onclick = () => begin(false);
$('tearButton').onclick = tear;
$('closeDialog').onclick = () => { if (!busy) dialog.close(); };
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
dialog.addEventListener('close', () => { if (!demo && state) void loadDay(); });
$('tearStage').onpointerdown = event => {
  if (busy || revealed) return;
  gestureX = event.clientX; $('tearStage').setPointerCapture(event.pointerId);
};
$('tearStage').onpointerup = event => {
  if (gestureX !== null && Math.abs(event.clientX - gestureX) > 30) void tear();
  gestureX = null;
};
$('tearStage').onpointercancel = () => { gestureX = null; };
window.addEventListener('pageshow', event => { if (event.persisted) void loadDay(); });
void loadDay();
