import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const loadoutSource = await readFile(new URL('../js/character-loadout-v2.js', import.meta.url), 'utf8');

function fixture({ suitEquipped = true, avatarEquipped = false } = {}) {
  const loadout = { WEAPON: 101 };
  if (suitEquipped) loadout.BATTLE_SUIT = 202;
  return {
    loadout,
    instances: [
      { instanceId: 101, quantity: 42, item: { id: 1, name: '테스트 무기', slot: 'WEAPON', rarity: 'RARE', image: 'weapon.png', totalPower: 100, pvePower: 90, pvpPower: 10 } },
      { instanceId: 202, item: { id: 2, name: '오로라 배틀슈트', slot: 'BATTLE_SUIT', subtype: 'BATTLE_SUIT', rarity: 'MYTHIC', image: 'battle-suit.png', totalPower: 5_000, pvePower: 5_000, pvpPower: 9_999 } }
    ],
    titles: [{ id: 3, name: '테스트 칭호', badgeText: '테스트', pvePower: 20, owned: true, equipped: true }],
    equippedTitleId: 3,
    vehicles: [{ id: 4, name: '테스트 차량', pvePower: 30, pvpPower: 15, owned: true, equipped: true }],
    equippedVehicleId: 4,
    bonuses: {},
    equippedAvatar: avatarEquipped ? { name: '딤우스', equipmentImage: 'dimwoos-avatar.webp' } : null,
    avatarFeature: { visible: false }
  };
}

function mount(data, request = async () => ({ ok: true, bonuses: {} })) {
  const listeners = new Map();
  const root = {
    innerHTML: '',
    isConnected: true,
    classList: { add() {}, remove() {} },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
    querySelector() { return null; },
    contains() { return true; }
  };
  const windowObject = {
    location: { href: 'https://example.test/character' },
    setTimeout() { return 1; },
    clearTimeout() {}
  };
  windowObject.window = windowObject;
  const context = vm.createContext({
    window: windowObject,
    URL,
    structuredClone,
    console,
    history: { replaceState() {} }
  });
  vm.runInContext(loadoutSource, context, { filename: 'character-loadout-v2.js' });
  const controller = windowObject.SoopketmonCharacterLoadoutV2.create(root, {
    data,
    profile: { nickname: '테스터' },
    request
  });
  return { root, listeners, controller };
}

function clickTarget(dataset = {}, attributes = []) {
  const target = {
    dataset,
    closest(selector) { return selector === 'button' ? target : null; },
    hasAttribute(name) { return attributes.includes(name); }
  };
  return target;
}

test('배틀슈트는 6번째 슬롯과 PVE 전투력만 제공하며 장비창 인물 외형을 바꾸지 않는다', () => {
  const { root, controller } = mount(fixture());
  const state = controller.getState();
  assert.equal(state.bonuses.equipmentPve, 90);
  assert.equal(state.bonuses.equipmentPvp, 10);
  assert.equal(state.bonuses.battleSuitPve, 5_000);
  assert.equal(state.bonuses.pve, 5_140);
  assert.equal(state.bonuses.pvp, 45, '배틀슈트에 잘못 들어온 pvpPower를 PVP 합계에 포함하면 안 된다');
  assert.match(root.innerHTML, /data-slot-card="BATTLE_SUIT"/);
  assert.match(root.innerHTML, /LOADOUT 06/);
  assert.match(root.innerHTML, /배틀슈트 \(PVE 전용\)/);
  assert.match(root.innerHTML, /EQUIPPED BATTLE SUIT · PVE ONLY/);
  assert.match(root.innerHTML, /OWNED EQUIPMENT/);
  assert.match(root.innerHTML, /2종 · 43개/);
  assert.match(root.innerHTML, /class="clv2-item-quantity" aria-label="보유 수량 42개">×42/);
  assert.match(root.innerHTML, /src="assets\/ui\/character-loadout-v2\/quartermaster-v1\.webp" alt="장비 관리 오퍼레이터"/);
  assert.doesNotMatch(root.innerHTML, /class="clv2-quartermaster[^"]*is-battle-suit|class="clv2-armory-stage[^"]*has-battle-suit|class="clv2-quartermaster[^"]*" src="battle-suit\.png"/);
  assert.match(root.innerHTML, /배틀슈트는 장비창 인물 외형을 바꾸지 않고 PVE 전투력만 적용합니다/);
});

test('장비창 인물 외형은 장착 아바타로만 교체된다', () => {
  const { root } = mount(fixture({ suitEquipped: true, avatarEquipped: true }));
  assert.match(root.innerHTML, /src="dimwoos-avatar\.webp" alt="딤우스 장착 아바타"/);
  assert.match(root.innerHTML, /is-equipped-avatar/);
  assert.doesNotMatch(root.innerHTML, /class="clv2-quartermaster[^"]*is-battle-suit|class="clv2-armory-stage[^"]*has-battle-suit|class="clv2-quartermaster[^"]*" src="battle-suit\.png"/);
});

test('배틀슈트 장착·해제는 기존 장비 API와 BATTLE_SUIT 슬롯 계약을 사용한다', async () => {
  const calls = [];
  const request = async (path, init = {}) => {
    calls.push({ path, init });
    return { ok: true, bonuses: {} };
  };
  const { listeners, controller } = mount(fixture({ suitEquipped: false }), request);
  listeners.get('click')({ target: clickTarget({ equip: '202' }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.getState().loadout.BATTLE_SUIT, 202);
  assert.equal(calls[0].path, 'character/equipment/equip');
  assert.deepEqual(JSON.parse(calls[0].init.body), { instanceId: 202 });

  listeners.get('click')({ target: clickTarget({ unequip: 'BATTLE_SUIT' }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.getState().loadout.BATTLE_SUIT, undefined);
  assert.equal(calls[1].path, 'character/equipment/unequip');
  assert.deepEqual(JSON.parse(calls[1].init.body), { slot: 'BATTLE_SUIT' });
});

test('CMS는 BATTLE_SUIT 부위·세부 종류와 PVE 전용 전투력을 분리해 안내한다', async () => {
  const [admin, adminCss, adminIndex, loadoutCss, app, legacyEquipment, pveCommand, pveCss, index, escort, liveBattle, liveCss, api] = await Promise.all([
    readFile(new URL('../admin/equipment-admin-v1278.js', import.meta.url), 'utf8'),
    readFile(new URL('../admin/equipment-admin-v1278.css', import.meta.url), 'utf8'),
    readFile(new URL('../admin/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../css/character-loadout-v2.css', import.meta.url), 'utf8'),
    readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/equipment-v1274.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/pve-command-v2-live.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/pve-command-v2.css', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../functions/_escort_operation.js', import.meta.url), 'utf8'),
    readFile(new URL('../js/battle-v2-live.js', import.meta.url), 'utf8'),
    readFile(new URL('../css/battle-v2-live.css', import.meta.url), 'utf8'),
    readFile(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8')
  ]);
  assert.match(admin, /BATTLE_SUIT:'배틀슈트'/);
  assert.match(admin, /slot==='BATTLE_SUIT'\)return \{total,pve:total,pvp:0,pveOnly:true\}/);
  assert.match(admin, /slot==='BATTLE_SUIT'\?\['BATTLE_SUIT'\]/);
  assert.match(admin, /PVE 전용 전투력/);
  assert.match(admin, /PVP 전투력에는 합산되지 않으며/);
  assert.match(adminCss, /\.equipment-power-preview\.equipment-pve-only/);
  assert.match(loadoutCss, /\.clv2-equip-slot\.slot-battle_suit/);
  assert.match(app, /character-loadout-v2\.js\?v=14-equipment-stack-count/);
  assert.match(app, /equipment-v1274\.js\?v=2032-challenger-title/);
  assert.match(adminIndex, /equipment-admin-v1278\.js\?v=2032-challenger-title/);
  assert.equal((adminIndex.match(/equipment-admin-v1278\.css\?v=1279-battle-suit-pve-only/g) || []).length, 2);
  assert.match(legacyEquipment, /pveOnly=item\.slot==='BATTLE_SUIT'/);
  assert.match(pveCommand, /BATTLE SUIT · PVE ONLY/);
  assert.match(pveCommand, /battleSuit: Number\(bonus\.battleSuitPve \|\| 0\)/);
  assert.match(pveCommand, /배틀슈트 \$\{number\(battleSuit\)\} \(PVE 전용\)/);
  assert.match(pveCss, /pvev2-roster-foot\{display:grid;grid-template-columns:repeat\(5,1fr\) auto/);
  assert.match(index, /pve-command-v2\.css\?v=1991-sweep-result-front/);
  assert.match(index, /pve-command-v2-live\.js\?v=2021-core-protocol-tabs/);
  assert.match(index, /js\/app\.js\?v=2033-prediction-star/);
  assert.match(escort, /sectorSummary,battleV2,monster,characterBonus:equipment,objective:/);
  assert.match(app, /const loadout=await apiRequest\('character\/loadout',\{\}, \{ttl:5000,timeoutMs:8000\}\)/);
  assert.match(app, /data:\{current,participant:me,characterBonus,user:loadUser\(\)\}/);
  assert.match(app, /pvpState\.characterBonus=bonuses;raidState\.characterBonus=bonuses/);
  assert.match(api, /battleEngine:pveBattleEngineState\(settings,user,characterBonus\)/);
  assert.match(api, /battleSuitLiveOverride/);
  assert.match(api, /activationScope:battleSuitLiveOverride\?'PVE_BATTLE_SUIT_ONLY'/);
  assert.match(api, /equippedBattleSuit:characterBonus\.equippedBattleSuit\|\|null/);
  assert.match(api, /battleSuitRuntime/);
  assert.match(liveBattle, /data-battle-suit-live-result="SERVER_TIMELINE"/);
  assert.match(liveBattle, /BATTLE SUIT · INDEPENDENT DAMAGE/);
  assert.match(liveBattle, /data\.playerPower \|\| data\.battleV2\?\.teams\?\.A\?\.summary\?\.power/);
  assert.match(liveCss, /\.pve-battle-suit-contribution/);
});
