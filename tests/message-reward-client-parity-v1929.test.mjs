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

test('mobile reward presentation keeps the generated claim control full width', async () => {
  const css = await read('css/soopketmon-v21-messages-attendance.css');
  const mobile = css.slice(css.indexOf('@media (max-width: 759px)'));
  assert.notEqual(mobile.length, css.length, 'mobile reward media query is missing');
  assert.match(mobile, /\.message-reward,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(mobile, /\.message-reward button,[\s\S]*?width:\s*100%/);
});
