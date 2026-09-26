// Isolated process, in-memory module override of the CMS seed. No production
// flags, on-disk live catalog, network, SQL credentials or user accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
const candidate=JSON.parse(fs.readFileSync('preview/mercenary-ice-crystal-dual-sword-v1/release/candidate.json'));
registerHooks({load(url,context,next){
 if(url.endsWith('/shared/mercenary-cryvern-v1.mjs'))return {format:'module',shortCircuit:true,
  source:fs.readFileSync(new URL(url),'utf8').replace('CRYVERN_RELEASE_ENABLED = false','CRYVERN_RELEASE_ENABLED = true')};
 if(url.endsWith('/functions/_mercenary_cms_seed.js'))return {format:'module',shortCircuit:true,
  source:'export const MERCENARY_CMS_SEED = '+JSON.stringify({catalog:candidate.catalog,document:candidate.document,sourceHash:'LOCAL_CRYVERN_CANDIDATE_ONLY'})+';'};
 return next(url,context);
}});
const {mercenaryFixture}=await import('./helpers/mercenary-db.mjs');
const {openMercenaryCards,saveMercenaryLoadout,loadMercenaryBattleSnapshot}=await import('../functions/_mercenary_account.js');
const {mercenaryGradePools}=await import('../shared/mercenary-draw-policy-v1.mjs');
const {CRYVERN_CODE}=await import('../shared/mercenary-cryvern-v1.mjs');
const {mercenaryCodexDocument}=await import('../functions/_mercenary_codex.js');
const {validateCatalog}=await import('../mercenary-codex/model.mjs');
const {MERCENARY_SKILLS,createSkillDraft,parseSkillDraft}=await import('../shared/mercenary-skills-v1.mjs');
const {compileRehearsal,sampleRehearsal}=await import('../preview/project-v-mercenary-system-v1/skill-rehearsal.mjs');
const {validateRankPolicy}=await import('../shared/mercenary-ranks-v1.mjs');
const {validatePositionDraft}=await import('../shared/mercenary-position-config-v1.mjs');
const {createMercenaryBattleArtAdapter}=await import('../js/project-v-mercenary-battle-art-adapter-v1.js');
test('future canonical roster, front position and 16-frame skill registration pass existing adapters',()=>{
 const roster=JSON.parse(fs.readFileSync('preview/mercenary-ice-crystal-dual-sword-v1/release/roster.json'));
 validateRankPolicy(roster);const art=createMercenaryBattleArtAdapter(roster).resolveForConsumer('BATTLE_FIELD',CRYVERN_CODE);
 assert.equal(art.sourceArt,candidate.registration.card.sourceArt);assert.equal(art.battleSprite,candidate.registration.card.battleSprite);
 const positions=JSON.parse(fs.readFileSync('preview/project-v-mercenary-system-v1/position-draft-v1.json'));
 positions.assignments=positions.assignments.filter(c=>roster.cards.some(card=>card.code===c.code));
 if(!positions.assignments.some(c=>c.code===CRYVERN_CODE))positions.assignments.push(candidate.registration.position);
 assert.deepEqual(validatePositionDraft(positions,roster),{ok:true,errors:[]});
 assert.equal(candidate.catalog.effects.frameCount,512);assert.equal(candidate.registration.effect.frames.length,16);
 for(const scenario of ['normal','counter','boss']){const plan=compileRehearsal('MS-049',scenario);assert.ok(plan.events.length);const end=sampleRehearsal(plan,plan.duration);assert.ok(end.actors.every(a=>a.hp>=0));}
});
test('offline public codex accepts exactly the untitled Cryvern and valid immutable asset paths',()=>{
 const result=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(candidate.document),revision:57}));
 const c=result.cards.find(c=>c.code===CRYVERN_CODE);assert.equal(c.title,'');assert.equal(c.rank,'SSS');assert.equal(c.skills[0].id,'MS-049');
 assert.ok(fs.existsSync(c.sourceArt));assert.ok(fs.existsSync(c.battleSprite));
 const invalid=structuredClone(result);invalid.cards.find(c=>c.code===CRYVERN_CODE).title='극빙의쌍검';assert.throws(()=>validateCatalog(invalid));
 invalid.cards.find(c=>c.code===CRYVERN_CODE).title='';invalid.cards[0].title='';assert.throws(()=>validateCatalog(invalid));
});
test('historical pre-Cryvern draft appends released skills without losing existing review edits',()=>{
 assert.equal(MERCENARY_SKILLS.length,34);
 const old=createSkillDraft();old.skills=old.skills.filter(s=>!['MS-049','MS-050','MS-051'].includes(s.id));old.skills[0].note='기존 운영자 의견';
 const before=structuredClone(old),next=parseSkillDraft(JSON.stringify(old));
 assert.deepEqual(old,before);assert.deepEqual(next.skills.slice(0,-3),before.skills);assert.deepEqual(next.skills.slice(-3).map(s=>s.id),['MS-049','MS-050','MS-051']);
 assert.deepEqual(parseSkillDraft(JSON.stringify(next)),next);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} activation: rare weighted SSS, idempotent receipt, ownership and separate mercenary slot`,async t=>{
 const f=await mercenaryFixture(t,{postgres});
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:CRYVERN_CODE,revision:0}),e=>e.code==='MERCENARY_NOT_OWNED');
 for(const o of f.draw.outcomes)o.chancePpm=o.id==='CARD_SSS'?1000000:0;
 f.draw.cardRules.cardWeights={'V-021':8991,'V-046':999,'V-049':10};await f.setDraw(f.draw);
 assert.deepEqual(mercenaryGradePools(f.document.mercenaries,candidate.catalog.cards.map(c=>c.code)).SSS,['V-021','V-046','V-049']);
 const before=await f.coin(),request={requestId:crypto.randomUUID(),count:2};
 const result=await openMercenaryCards(f.env,f.user,request,{randomInt:max=>max===10000?9999:0});
 assert.ok(result.draws.every(d=>d.mercenaryCode===CRYVERN_CODE));assert.deepEqual(result.draws.map(d=>d.duplicate),[false,true]);
 await openMercenaryCards(f.env,f.user,request,{randomInt(){throw Error('duplicate random draw');}});assert.equal(await f.coin(),before-2000);
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:CRYVERN_CODE,revision:0});
 const m=await loadMercenaryBattleSnapshot(f.env,f.user);assert.equal(m.name,'크라이베른');assert.equal(m.title,'');assert.equal(m.rank,'SSS');assert.equal(m.basePower,180000);
 assert.equal(m.sourceArt,candidate.registration.card.sourceArt);assert.equal(m.battleSprite,candidate.registration.card.battleSprite);assert.deepEqual(m.skills.map(s=>s.id),['MS-049']);
});
