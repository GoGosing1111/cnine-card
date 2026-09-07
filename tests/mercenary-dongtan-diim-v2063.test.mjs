import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ROSTER_URL,filterCards,sdStatus} from '../preview/mercenary-codex-v1/model.js';
import {createMercenaryBattleArtAdapter} from '../js/project-v-mercenary-battle-art-adapter-v1.js';

const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root));
const json=file=>JSON.parse(read(file));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const roster=json('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json');
const approval=json('assets/ui/project-v/mercenaries/mercenary-dongtan-diim-approval-20260907.json');
const card=roster.cards.find(entry=>entry.code==='V-043');
const sourceHash='81FE7FB2BACEBF340FD53F730668BA079831DA7E5F34C396D4285DACECFA8B92';

test('Dongtan Diim uses the approved name and preserves all previous 42 mercenary records',()=>{
  assert.equal(approval.userRequest,'디임 용병사진도 라이브 배포하고');
  assert.equal(approval.scope,'READ_ONLY_CATALOG_ONLY');
  assert.equal(approval.newCards,1);
  assert.equal(approval.existingCardsPreserved,42);
  assert.equal(hash(JSON.stringify(roster.cards.slice(0,42))),approval.previousRosterCardsSha256);
  assert.deepEqual(roster.cards.slice(42).map(entry=>entry.code),['V-043']);
  assert.equal(card.name,'동탄 디임');
  assert.equal(card.nameStatus,'USER_ASSIGNED_NAME');
  assert.equal(card.catalogRelease,'READ_ONLY_USER_APPROVED');
  assert.equal(card.sourceArtStatus,'APPROVED_SOURCE_ART');
  for(const q of ['동탄 디임','동탄디임','디임','ㄷㅌㄷㅇ','V043','회색 니트 원피스']){
    assert.deepEqual(filterCards(roster.cards,{q}).map(entry=>entry.code),['V-043'],q);
  }
  assert.equal(filterCards(roster.cards,{sort:'newest'})[0].code,card.code);
});

test('the final game-illustration V4 is connected byte-for-byte with only separate WebP derivatives',async()=>{
  const entry=approval.entries[0];
  assert.equal(approval.originalsModified,false);
  assert.equal(entry.approvedDraftVersion,'V4_GAME_ILLUSTRATION');
  assert.equal(entry.sourceArt,card.sourceArt);
  assert.equal(card.sourceArtSha256,sourceHash);
  assert.equal(hash(read(entry.reviewSource)),sourceHash);
  assert.equal(hash(read(card.sourceArt)),sourceHash);
  assert.ok(read(entry.promptRecord).toString().includes('Exact style-transfer prompt'));
  const meta=await sharp(read(card.sourceArt)).metadata();
  assert.deepEqual([meta.width,meta.height,meta.channels,meta.hasAlpha,meta.space],[1024,1536,3,false,'srgb']);
  const images=json('assets/ui/project-v/mercenaries/codex-v1/manifest.json').entries.filter(entry=>entry.code===card.code);
  assert.deepEqual(images.map(entry=>[entry.kind,entry.width]),[['art',320],['art',640]]);
  for(const image of images){
    assert.equal(image.sourceSha256,sourceHash);
    assert.equal(hash(read('assets/ui/project-v/mercenaries/codex-v1/'+image.file)),image.sha256);
  }
});

test('Diim is read-only with fresh caches, no assigned rank and no original-as-SD fallback',()=>{
  assert.equal(ROSTER_URL.searchParams.get('v'),'2063.2-dongtan-diim');
  assert.deepEqual(roster.summary,{total:43,sourceArtReady:43,battleSpriteReady:37,battleSpritePending:6,rankPending:43});
  assert.equal(approval.runtimeConnected,false);
  assert.equal(approval.rankAssigned,false);
  assert.equal(card.rank,null);
  assert.equal(card.rankStatus,'PENDING_USER_ASSIGNMENT');
  assert.equal(card.roleStatus,'ART_CONCEPT_ONLY');
  assert.equal(card.battleSprite,null);
  assert.equal(card.battleSpriteStatus,'NOT_YET_PRODUCED');
  assert.equal(sdStatus(card),'제작 대기');
  assert.equal(createMercenaryBattleArtAdapter(roster).resolveForConsumer('BATTLE_FIELD',card.code),null);
  const html=read('mercenary-codex/index.html').toString();
  assert.match(html,/동탄 디임\(V-043\)/);
  assert.match(html,/codex\.js\?v=2063\.2-dongtan-diim/);
  assert.match(html,/로비로 돌아가기/);
  assert.match(html,/전체 원화 43종, 전투 SD 37종/);
});
