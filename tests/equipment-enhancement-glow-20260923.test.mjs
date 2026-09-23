import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const source = read('js/character-loadout-v2.js');
const css = read('css/character-loadout-v2.css');
const row = (id, slot, level) => ({
  instanceId: id, quantity: 1, enhancement: { level },
  item: { id, name: '장비 ' + id, slot, rarity: 'MYTHIC', image: '/equipment.png', totalPower: 150, pvePower: 100, pvpPower: 50 }
});
function render(data) {
  const listeners = {};
  const root = {
    innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(type, fn) { listeners[type] = fn; }, removeEventListener() {},
    contains() { return true; }, classList: { add() {}, remove() {} }
  };
  const calls = [];
  const context = vm.createContext({
    window: { location: { href: 'http://localhost/?tab=equipment' }, clearTimeout() {}, setTimeout() { return 1; } },
    URL, structuredClone, history: { replaceState() {} }
  });
  vm.runInContext(source, context);
  const app = context.window.SoopketmonCharacterLoadoutV2.create(root, {
    data, request: async (path, init) => { calls.push({ path, body: JSON.parse(init.body) }); return { ok: true }; }
  });
  assert.doesNotMatch(root.innerHTML, /clv2-load-error/);
  return { root, app, calls, click(dataset) { listeners.click({ target: { closest() { return { dataset, disabled: false, hasAttribute() { return false; } }; } } }); } };
}
const levels = html => [...html.matchAll(/data-enhancement-glow="(\d+)"/g)].map(match => Number(match[1]));
const fixture = () => ({
  instances: [row(1, 'WEAPON', 8), row(2, 'TOP', 9), row(3, 'BOTTOM', 10), row(4, 'SHOES', 7), row(5, 'ACCESSORY', 0), row(6, 'BATTLE_SUIT', 10)],
  loadout: { WEAPON: 1, TOP: 2, BOTTOM: 3, SHOES: 4, ACCESSORY: 5, BATTLE_SUIT: 6 },
  skillChips: { visible: true, catalog: [], loadout: [] }
});

test('exactly +8/+9/+10 decorate equipped and owned equipment, without altering power or quantities', () => {
  const data = fixture(), before = structuredClone(data), { root, app } = render(data);
  assert.deepEqual(levels(root.innerHTML).sort(), [8, 8, 9, 9, 10, 10].sort());
  for (const level of [8, 9, 10]) {
    assert.match(root.innerHTML, new RegExp('clv2-slot-art" data-enhancement-glow="' + level + '"'));
    assert.match(root.innerHTML, new RegExp('clv2-inventory-art" data-enhancement-glow="' + level + '"'));
    assert.equal(root.innerHTML.split('class="clv2-enhancement-level" aria-hidden="true">+' + level + '</b>').length - 1, 2);
  }
  assert.deepEqual(data, before, 'caller data remains unchanged');
  assert.deepEqual(app.getState().instances.map(r => [r.enhancement.level, r.quantity, r.item.totalPower]), data.instances.map(r => [r.enhancement.level, r.quantity, r.item.totalPower]));
  assert.equal(app.getState().bonuses.equipmentPve, 500);
  assert.equal(app.getState().bonuses.equipmentPvp, 250);
});

test('other levels, missing enhancement, invalid values and battle suits never glow', () => {
  const instances = [undefined, null, 0, 1, 2, 3, 4, 5, 6, 7, 11, -8, 8.5, 'invalid', Infinity].map((level, i) => row(i + 1, 'WEAPON', level));
  instances.push({ instanceId: 99, item: row(99, 'TOP', 0).item }, row(100, 'BATTLE_SUIT', 10));
  const { root } = render({ instances, loadout: { BATTLE_SUIT: 100 } });
  assert.deepEqual(levels(root.innerHTML), []);
  assert.doesNotMatch(root.innerHTML, /clv2-enhancement-light|clv2-enhancement-level/);
  assert.deepEqual(levels(render({ instances: [row(1, 'WEAPON', '9')] }).root.innerHTML), [9]);
});

test('title, vehicle and skill-chip tabs never render equipment glow', () => {
  const { root, app } = render(fixture());
  for (const tab of ['title', 'garage', 'skillChips']) {
    app.setTab(tab);
    assert.match(root.innerHTML, new RegExp('data-active-tab="' + tab + '"'));
    assert.deepEqual(levels(root.innerHTML), []);
  }
  app.setTab('equipment');
  assert.equal(levels(root.innerHTML).length, 6);
});

test('equip/unequip uses existing instance API and updates only the matching slot glow', async () => {
  const data = fixture(); data.instances.push(row(7, 'WEAPON', 10));
  const { root, app, calls, click } = render(data);
  click({ equip: '7' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.getState().loadout.WEAPON, 7);
  assert.deepEqual(calls[0], { path: 'character/equipment/equip', body: { instanceId: 7 } });
  assert.equal(levels(root.innerHTML).filter(n => n === 8).length, 1);
  assert.equal(levels(root.innerHTML).filter(n => n === 10).length, 4);
  click({ unequip: 'WEAPON' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.getState().loadout.WEAPON, undefined);
  assert.deepEqual(calls[1], { path: 'character/equipment/unequip', body: { slot: 'WEAPON' } });
  assert.equal(levels(root.innerHTML).filter(n => n === 10).length, 3);
});

test('glow stays equipment-scoped, click-through, distinct and reduced-motion safe', () => {
  const block = css.slice(css.indexOf('/* Equipment-window enhancement light:'), css.indexOf('.clv2-item-quantity {'));
  const selectors = block.split('\n').filter(line => line.includes('.clv2-'));
  assert.ok(selectors.length >= 10);
  assert.ok(selectors.every(line => line.trim().startsWith('.clv2-shell[data-active-tab="equipment"]')));
  for (const [level, color] of [[9, '#d7a1ff'], [10, '#ffe4a2']]) {
    const selector = '.clv2-item-art[data-enhancement-glow="' + level + '"] {';
    const start = block.indexOf(selector);
    assert.ok(start >= 0, 'matching selector specificity for level ' + level);
    assert.ok(block.slice(start, block.indexOf('}', start)).includes('--rim: ' + color + ';'));
  }
  assert.match(block, /pointer-events: none/);
  assert.match(block, /mask-composite: exclude/);
  assert.match(block, /prefers-reduced-motion: reduce/);
  assert.match(block, /animation: none; opacity: 1/);
  assert.match(block, /clv2-rim-orbit 5s/);
  assert.match(block, /clv2-rim-orbit 3\.8s/);
});

test('production and shared preview invalidate the changed equipment resources', () => {
  const app = read('js/app.js'), index = read('index.html');
  for (const path of ['css/character-loadout-v2.css', 'js/character-loadout-v2.js']) {
    const start = app.indexOf("'" + path + '?');
    assert.ok(start >= 0);
    assert.ok(app.slice(start, app.indexOf("'", start + 1)).includes('&enhanceGlow=20260923'));
  }
  assert.ok(index.split('\n').find(line => line.includes('src="js/app.js?')).includes('&amp;enhanceGlow=20260923'));
  assert.match(read('preview/live-character-loadout-v2-v1/preview.js'), /get\('enhancementGlow'\) === '1'/);
});
