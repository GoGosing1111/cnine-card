import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

function objectKeys(source, declaration) {
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `${declaration} declaration is missing`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) {
      const block = source.slice(open + 1, index);
      return new Set([...block.matchAll(/(?:^|,)\s*([A-Z][A-Z0-9_]*)\s*:/g)].map(match => match[1]));
    }
  }
  assert.fail(`${declaration} object is not closed`);
}

test('every server-supported message reward renders a client claim control', async () => {
  const [app, api] = await Promise.all([read('js/app.js'), read('functions/api/[[path]].js')]);
  const clientTypes = objectKeys(app, 'const MESSAGE_REWARD_META=');
  const serverTypes = objectKeys(api, 'const VERIFIED_MESSAGE_REWARD_TYPES=');

  assert.deepEqual([...serverTypes].filter(type => !clientTypes.has(type)), []);
  assert.ok(clientTypes.has('HIGH_GRADE_REROLL_TICKET'));
  assert.match(app, /messageReward=Boolean\(rewardMeta\)&&Number\(m\.reward_amount\)>0/);
  assert.match(app, /data-claim-message="\$\{m\.id\}"/);
});

test('message center offers a serialized one-click bulk reward claim', async () => {
  const app = await read('js/app.js');
  const start = app.indexOf('async function claimAllMessageRewards');
  const end = app.indexOf('async function loadMessages', start);
  assert.notEqual(start, -1, 'bulk message reward claim helper is missing');
  assert.ok(end > start, 'bulk claim helper boundary is missing');
  const bulk = app.slice(start, end);
  assert.match(app, /id="claimAllMessages"[^>]*disabled/);
  assert.match(app, /보상 일괄 수령 · \$\{claimable\.length\.toLocaleString\(\)\}건/);
  assert.match(bulk, /for\(const \[index,message\] of queue\.entries\(\)\)/);
  assert.match(bulk, /apiRequest\('messages\/claim'/);
  assert.doesNotMatch(bulk, /Promise\.all/, 'message claims must remain serialized so the user mutation lock cannot reject sibling requests');
  assert.match(bulk, /이미 처리된 보상[^]*중복 지급하지 않았습니다/);
});

test('mobile reward presentation keeps the generated claim control full width', async () => {
  const css = await read('css/soopketmon-v21-messages-attendance.css');
  const mobile = css.slice(css.indexOf('@media (max-width: 759px)'));
  assert.notEqual(mobile.length, css.length, 'mobile reward media query is missing');
  assert.match(mobile, /\.message-reward,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(mobile, /\.message-reward button,[\s\S]*?width:\s*100%/);
  assert.match(mobile, /\.message-head-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(mobile, /\.message-head \.message-claim-all\s*\{[\s\S]*?width:\s*100%/);
});

test('message presentation cache version includes the bulk claim styles', async () => {
  const [index, presentation] = await Promise.all([read('index.html'), read('js/soopketmon-v21-rewards-presentation.js')]);
  assert.match(index, /soopketmon-v21-rewards-presentation\.js\?v=21\.4-message-bulk-claim/);
  assert.match(presentation, /const VERSION = '21\.4\.0'/);
});
