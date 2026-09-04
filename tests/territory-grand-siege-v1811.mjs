import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';

const server=await readFile(new URL('../functions/_territory_war.js',import.meta.url),'utf8');
const client=await readFile(new URL('../js/territory-war-v1811.js',import.meta.url),'utf8');
const renderer=await readFile(new URL('../js/battle-v3-live.js',import.meta.url),'utf8');
const app=await readFile(new URL('../js/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../css/territory-war-v1811.css',import.meta.url),'utf8');
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
const admin=await readFile(new URL('../admin/territory-war-admin-v1362.js',import.meta.url),'utf8');

for(const operation of ['CARPET_BOMBING','SPG_BARRAGE','AIR_DEFENSE','COUNTER_BATTERY']){
  assert.match(server,new RegExp(operation));
}
assert.match(server,/territory_war_v3_command_messages/);
assert.match(server,/territory_war_v3_mass_assault_uses/);
assert.match(server,/PRIMARY KEY\(round_id,side\)/);
assert.match(server,/massAssaultBySide/);
assert.match(server,/territory-war\/commander-message/);
assert.match(server,/admin\/territory-war\/reset-command-messages/);
assert.match(server,/TERRITORY_COMMAND_MESSAGES_RESET/);
assert.match(admin,/tw3ResetCommandMessages/);
assert.match(admin,/admin\/territory-war\/reset-command-messages/);
assert.match(admin,/개인전 최인접 매칭 진단/);
assert.match(admin,/실전 15% 상한 보정/);
assert.match(server,/admin\/territory-war\/assign-participant-side/);
assert.match(server,/TERRITORY_PARTICIPANT_SIDE_ASSIGN/);
assert.match(admin,/tw3AssignNickname/);
assert.match(server,/territory_war_v3_commander_overrides/);
assert.match(server,/admin\/territory-war\/assign-commander/);
assert.match(server,/TERRITORY_COMMANDER_ASSIGN/);
assert.match(admin,/tw3CommanderNickname/);
assert.match(admin,/tw3AssignCommander/);
assert.match(admin,/tw3MassAssaultSide/);
assert.match(admin,/ONCE PER TEAM \/ ROUND/);
assert.match(server,/counterBatteryGaugeBonus/);
assert.match(server,/version:'V3',renderer:'PIXIJS',mode:'SIEGE'/);

assert.match(client,/function tw4CommanderHtml/);
assert.match(client,/data-tw3-command-form/);
assert.match(client,/mode:'SIEGE'/);
assert.match(client,/playSiegeBattleV2Live/);
assert.match(client,/tw4-map-shell/);
assert.match(client,/territory-war-open/);
assert.match(css,/GRAND SIEGE COMMAND/);
assert.match(css,/grid-template-rows:repeat\(5,78px\)/);
assert.match(css,/body\.territory-war-open \.pwa-install-button\{display:none!important\}/);
assert.match(css,/grid-template-columns:1fr 1fr/);
assert.match(css,/recruit-fortress-v1-v1497\.webp/);
assert.match(css,/siege-front-v1-v1497\.webp/);
assert.match(renderer,/mode === 'PVP' \|\| mode === 'SIEGE'/);
assert.match(app,/typeof window\.playSiegeBattleV2Live==='function'/);
assert.match(index,/js\/app\.js\?v=2031-prison-community/);
assert.match(index,/territory-war-v1811\.js\?v=1995-territory-coin-sync/);

for(const name of ['carpet-bombing','spg-barrage','air-defense','counter-battery','mass-assault','truce']){
  const file=new URL(`../assets/ui/territory-war/${name}-v1811.webp`,import.meta.url);
  const info=await stat(file);
  assert.ok(info.size>10_000,`${name} image should not be empty`);
  assert.ok(info.size<80_000,`${name} image must stay under 80KB`);
}

console.log('territory grand siege v1811: ok');
