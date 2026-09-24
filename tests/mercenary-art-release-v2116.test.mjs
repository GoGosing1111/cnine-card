import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {validateCatalog,filterCatalog} from '../mercenary-codex/model.mjs';
import {mercenaryGradePools} from '../shared/mercenary-draw-policy-v1.mjs';

test('approved Hi Heeya artwork is promoted once into the SS gameplay catalog without rewriting existing CMS values',()=>{
  const saved=structuredClone(seed.document);saved.mercenaries[0].name='운영 저장 이름';saved.mercenaries[0].rank='SS';
  const before=structuredClone(saved),row={payload_json:JSON.stringify(saved),revision:54,updated_at:'2026-09-13'};
  const result=validateCatalog(mercenaryCodexDocument(row)),heeya=result.cards.find(c=>c.code==='V-044');
  assert.equal(result.cards.length,49);assert.equal(result.revision,54);assert.equal(result.artReleaseVersion,'20260919-ragniel-live-v1');
  assert.equal(heeya.name,'하이희야');assert.equal(heeya.rank,'SS');assert.notEqual(heeya.artOnly,true);
  assert.equal(heeya.basePower,120000);assert.ok(heeya.battleSprite.endsWith('mercenary-v044-hi-heeya-sd-v1.png'));assert.deepEqual(heeya.skills.map(s=>s.id),['MS-044']);
  assert.equal(result.cards[0].name,'운영 저장 이름');assert.deepEqual(saved,before);assert.equal(seed.catalog.cards.length,49);
  const pools=mercenaryGradePools(saved.mercenaries,seed.catalog.cards.map(c=>c.code));
  assert.ok(JSON.stringify(pools).includes('V-044'));
  assert.equal(filterCatalog(result.cards,{q:'하이희야',rank:'SS'},new Set())[0].code,'V-044');
  const invalid=structuredClone(result);invalid.cards.at(-1).position=null;assert.throws(()=>validateCatalog(invalid));
});
test('published original is the exact user attachment, with native RGB 2:3 dimensions',()=>{
  const record=JSON.parse(fs.readFileSync(new URL('../assets/ui/project-v/mercenaries/mercenary-hi-heeya-approval-20260915.json',import.meta.url)));
  const data=fs.readFileSync(new URL('../'+record.sourceArt,import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex').toUpperCase(),record.sourceSha256);
  assert.equal(data.readUInt32BE(16),1024);assert.equal(data.readUInt32BE(20),1536);assert.equal(data[25],2);
  assert.equal(record.processing,'NONE_BYTE_FOR_BYTE_COPY');
});
