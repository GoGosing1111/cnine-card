import {buildPreviewDeck} from '../idle-v3-v1/source/idle-model.mjs';
import {createPveBattleV2, buildFighter, publicFighter, teamSummary} from '../../functions/_battle_v2_preview.js';
const CONTENTS = [
  ['HUNT','토벌','HUNT',3], ['TOWER','무한의탑','TOWER',18], ['RAID','월드 레이드','RAID',70],
  ['SEAL','봉인전','SEAL',3], ['ESCORT','호송작전','ESCORT',68], ['APOCALYPSE','아포칼립스','HUNT',73],
  ['PVP','랭크전','PVP'], ['SIEGE','공성전','SIEGE'], ['TERRITORY','영토전','SIEGE'], ['CLAN','클랜전','PVP']
];
const $ = id => document.getElementById(id), json = async url => {const r = await fetch(url); if (!r.ok) throw Error(url); return r.json();};
let ready = false, busy = false, payload, catalog, equipment, monsters, bridge;
function fixture(code) {
  const [, label, field, monsterId] = CONTENTS.find(row => row[0] === code), cards = buildPreviewDeck(catalog);
  const suit = equipment.suits.find(row => row.code === 'BATTLE_SUIT_03'), weapon = equipment.weapons.find(row => row.equipmentCode === 'EQ_1788486929132');
  const equippedBattleSuit = {code: suit.code, pvePower: 300000, appearance: {battleSprite: suit.image, battleHeight: 278}};
  const equippedWeapon = {code: weapon.equipmentCode, appearance: {battleSprite: weapon.battleSprite}};
  // Keep equipment in the fixture even in versus modes to exercise the existing PVE gate.
  const base = {mode: code, battlefieldMode: field, previewOnly: true, cards, title: `${label} · 공통 배치`, accountNickname: 'PVE 배틀슈트', equippedBattleSuit, equippedWeapon};
  if (!monsterId) {
    const a = cards.map((card,i) => buildFighter(card,i,'A',null,'PVP')), b = cards.map((card,i) => buildFighter(card,i,'B',null,'PVP'));
    return {...base, opponentCards: cards, battleV2: {schemaVersion: 2, teams: {A: {cards: a.map(publicFighter), summary: teamSummary(a)}, B: {cards: b.map(publicFighter), summary: teamSummary(b)}}, result: {timeline: [], final: {A: a.map(publicFighter), B: b.map(publicFighter)}}}};
  }
  const art = monsters.find(row => row.monsterId === monsterId);
  const monster = {...art, id: monsterId, name: art.name, image: art.sourceArt, image_url: art.sourceArt, battle_power: 1500000, is_boss: art.isBoss ? 1 : 0};
  const objective = code === 'ESCORT' ? {id: 'ESCORT_OBJECTIVE', hp: 10000, maxHp: 10000, image: '/assets/ui/escort/escort-armored-carrier-v1.webp'} : null;
  return {...base, monster, ...(objective ? {objective} : {}), battleV2: createPveBattleV2({cards, monster, seed: 7123,
    battleSuit: {...equippedBattleSuit, weapon: equippedWeapon, accountNickname: base.accountNickname}, escortObjective: objective})};
}
async function select(code = $('content').value) {
  if (busy) return; busy = true; ready = false; $('content').disabled = $('reset').disabled = true;
  try {
    payload = fixture(code); await bridge.prepare(payload); ready = true;
    const state = bridge.diagnostics();
    $('status').textContent = `${payload.title} · 실제 자리 ${state.formation.tiles.length}칸 · 일반 카드 5장${state.formation.support ? ' + PVE 슈트' : ''}`;
    $('content').value = code;
    const url = new URL(location.href); url.searchParams.set('content',code); history.replaceState(null,'',url);
  } catch (error) {$('status').textContent = `준비 실패: ${error.message}`; console.error(error);}
  finally {busy = false; $('content').disabled = $('reset').disabled = !ready;}
}
async function boot() {
  const [fur,zenith,superstar,manifest,gear] = await Promise.all([
    json('/assets/ui/project-v/characters/fur/manifest-v2.json'), json('/assets/ui/project-v/characters/zenith/manifest-v1.json'),
    json('/assets/ui/project-v/characters/superstar/manifest-v1.json'), json('/assets/ui/project-v/monsters/hunt-tower/manifest-v1.json'),
    json('/assets/ui/project-v/account-battle-suits/manifest-v2.json')]);
  catalog = [fur,zenith,superstar].flatMap(m => m.characters.map(c => ({...c,grade:m.rarity,sourceArt:'/'+c.sourceArt.replace(/^\/+/,''),battleSprite:'/'+c.battleSprite.replace(/^\/+/, '')})));
  monsters = manifest.sprites; equipment = gear;
  $('content').innerHTML = CONTENTS.map(([code,label]) => `<option value="${code}">${label}</option>`).join('');
  const until = performance.now() + 25000;
  while (!(bridge = $('battle-frame').contentWindow.CommonGridBridge)) {if (performance.now() > until) throw Error('V3 준비 시간 초과'); await new Promise(r => setTimeout(r,50));}
  const code = new URL(location.href).searchParams.get('content'); await select(CONTENTS.some(row => row[0] === code) ? code : 'HUNT');
}
$('content').addEventListener('change',()=>select()); $('reset').addEventListener('click',()=>select());
window.V3GridContents = {select, diagnostics: () => ({ready,busy,content:$('content').value,...bridge?.diagnostics()}), get payload(){return payload;}};
boot().catch(error => {$('status').textContent = error.message; console.error(error);});
