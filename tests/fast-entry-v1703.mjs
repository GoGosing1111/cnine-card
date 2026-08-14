import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const api=readFileSync(new URL('functions/api/[[path]].js',root),'utf8');
const scrapyard=readFileSync(new URL('functions/_scrapyard.js',root),'utf8');
const drops=readFileSync(new URL('functions/_drop_pool.js',root),'utf8');
const workshop=readFileSync(new URL('js/workshop-v1676.js',root),'utf8');
const battle=readFileSync(new URL('js/scrapyard-battle-v1698.js',root),'utf8');

const matchStart=api.indexOf('async function createRankedMatchTicket');
const existingTicket=api.indexOf('const existing=',matchStart);
const formationBuild=api.indexOf('pvpFormationPower(env,user.id,battle)',matchStart);
assert.ok(existingTicket>matchStart&&formationBuild>existingTicket,'ranked ticket reuse must run before formation rebuild');
assert.match(api,/ORDER BY ABS\(p\.season_score-\?\) ASC,p\.updated_at DESC LIMIT 36/,'ranked candidate formation fan-out must stay bounded');
assert.match(api,/\[recentRows,candidates\]=await Promise\.all/,'ranked history and candidates must load together');
assert.match(api,/\[lifecycle,burning\]=await Promise\.all/,'ranked lifecycle and burning settings must load together');

assert.doesNotMatch(scrapyard,/status\(env,user,raidDeckPower\)[\s\S]{0,180}settings\(env,\{fresh:true\}\)/,'scrapyard status must use the short settings cache');
assert.match(scrapyard,/\[ticketRemaining,deck\]=await Promise\.all/,'ticket reservation and deck snapshot must run together');
assert.match(scrapyard,/SELECT x\.ticket_consumed,COALESCE\(i\.quantity,0\) quantity/,'ticket verification and balance must use one read');
assert.match(scrapyard,/staleRecoveryAt/,'stale receipt recovery must be throttled');
assert.match(drops,/GROUP BY entry_id/,'drop daily limits must be fetched as one grouped query');
assert.match(drops,/LEFT JOIN cnine_user_inventory ui ON ui\.user_id=\?/,'drop inventory metadata and balances must be fetched together');

assert.match(workshop,/showScrapyardConnecting\(difficulty\)/,'the battle frame must open before the run response arrives');
assert.match(workshop,/closeScrapyardConnecting\(\);alert\(error\.message\)/,'failed entries must close the connecting frame');
assert.match(battle,/setTimeout\(done,1800\)/,'broken monster images must not stall entry for seven seconds');

console.log('v1703 ranked matchmaking and scrapyard fast-entry bottleneck guards verified');
