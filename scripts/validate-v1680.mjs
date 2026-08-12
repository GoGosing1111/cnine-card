import fs from 'node:fs';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const checks=[];
function assert(name,value){if(!value)throw new Error(`FAIL: ${name}`);checks.push(name)}

const scrapyard=read('functions/_scrapyard.js');
const drops=read('functions/_drop_pool.js');
const app=read('js/app.js');
const workshop=read('js/workshop-v1676.js');
const migration=read('database/migrations/0074_v1680_scrapyard_entry_ticket.sql');
const css=read('css/workshop-v1676.css');

assert('entry ticket inventory item',migration.includes("'SCRAPYARD_ENTRY_TICKET'")&&migration.includes("'ENTRY_TICKET'"));
assert('ticket asset exists',fs.existsSync(new URL('../assets/ui/scrapyard/scrapyard-entry-ticket-v1680.png',import.meta.url)));
assert('unified drop pool registration',drops.includes("'SCRAPYARD_ENTRY_TICKET_DROP'")&&drops.includes("'PVE_AUTO','*','WIN'"));
assert('misses do not create D1 receipts',drops.includes("skipped:'NO_REWARD'")&&drops.indexOf("skipped:'NO_REWARD'")<drops.indexOf("INSERT OR IGNORE INTO ${RECEIPT_TABLE}"));
assert('drop retries are deterministic',drops.includes('seededRandom')&&drops.includes('pool.config_version'));
assert('ticket gate in status response',scrapyard.includes('ticketRequired:true')&&scrapyard.includes('canEnterWithTicket'));
assert('ticket reserve and atomic decrement',scrapyard.includes('reserveEntryTicket')&&scrapyard.includes('quantity=quantity-1')&&scrapyard.includes("status='RESERVED'"));
assert('failed processing refunds ticket',scrapyard.includes('refundEntryTicket')&&scrapyard.includes("status='REFUNDED'"));
assert('stale reservation recovery',scrapyard.includes('recoverStaleEntryTickets')&&scrapyard.includes("'-5 minutes'"));
assert('inventory category and navigation',app.includes('data-inventory-filter="ENTRY_TICKET"')&&app.includes("itemCode==='SCRAPYARD_ENTRY_TICKET'")&&app.includes("renderShell('workshop')"));
assert('scrapyard ticket UI and gate',workshop.includes('ws80-ticket-pass')&&workshop.includes('출입 허가증 필요')&&workshop.includes('ticketQuantity>0'));
assert('responsive ticket presentation',css.includes('.ws80-ticket-pass')&&css.includes('@media(max-width:560px)'));

console.log(`V1680 validation passed (${checks.length} checks)`);
for(const name of checks)console.log(`- ${name}`);
