import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {participationInventoryReward} from '../functions/_territory_war.js';

const server=await readFile(new URL('../functions/_territory_war.js',import.meta.url),'utf8');
const client=await readFile(new URL('../js/territory-war-v1811.js',import.meta.url),'utf8');

assert.deepEqual(participationInventoryReward(99),{scrapyardTickets:0,mysticEnergy:0});
assert.deepEqual(participationInventoryReward(100),{scrapyardTickets:20,mysticEnergy:1});
assert.deepEqual(participationInventoryReward(500),{scrapyardTickets:20,mysticEnergy:1});

assert.match(server,/MAX_SETTLEMENT_REWARD_COMPONENT_COIN=1_000_000_000_000/);
assert.match(server,/scrapyard_ticket_quantity/);
assert.match(server,/mystic_energy_quantity/);
assert.match(server,/SCRAPYARD_ENTRY_TICKET/);
assert.match(server,/STARLIGHT_ARMOR_CORE/);
assert.match(server,/TERRITORY_WAR_100_ATTACK_REWARD/);
assert.match(server,/participationItems=participationInventoryReward\(v3\.attacks\)/);
assert.match(server,/participationItems=reward\.version==='V3'\?participationInventoryReward\(reward\.attacks\)/);
assert.doesNotMatch(server,/ADD COLUMN IF NOT EXISTS scrapyard_ticket_quantity/);
assert.doesNotMatch(server,/ADD COLUMN IF NOT EXISTS mystic_energy_quantity/);
assert.doesNotMatch(server,/REWARD_COLUMNS=[^\n]*scrapyard_ticket_quantity/);
assert.doesNotMatch(server,/REWARD_COLUMNS=[^\n]*mystic_energy_quantity/);
assert.match(client,/폐차장 입장권/);
assert.match(client,/미스틱 에너지/);

console.log('territory 100 attack inventory reward v1916: ok');
