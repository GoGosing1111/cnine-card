import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ZENITH_EVOLUTION_PITY_ATTEMPTS,zenithEvolutionPityState} from '../functions/_evolution.js';

assert.equal(ZENITH_EVOLUTION_PITY_ATTEMPTS,7);
for(let failed=0;failed<6;failed++)assert.equal(zenithEvolutionPityState(failed).isPity,false,`${failed+1}번째 도전은 확정이 아니어야 합니다.`);
assert.deepEqual(zenithEvolutionPityState(6),{pityAttempts:7,nextAttempt:7,isPity:true});
assert.equal(zenithEvolutionPityState(7).isPity,true,'기존 7회 실패 기록도 보상 대상이어야 합니다.');

const server=fs.readFileSync(new URL('../functions/_evolution.js',import.meta.url),'utf8');
assert.match(server,/success=isPity\|\|randomPercent\(\)<successRate/,'7번째 도전은 확률 추첨 없이 성공해야 합니다.');
assert.match(server,/pityAttempts:ZENITH_POLICY\.pityAttempts/,'유저 진화 화면에 7회 천장을 내려줘야 합니다.');
assert.match(server,/zenith_evolution_pity_compensations_v1718/,'기존 7회 실패 계정 보상은 중복 지급 방지 원장을 사용해야 합니다.');
assert.match(server,/p\.failed_attempts>=\?/,'기존 7회 이상 실패 기록을 조회해야 합니다.');
assert.match(server,/UPDATE user_cards SET quantity=0,breakthrough_level=0/,'보상도 정상 진화처럼 원본 LIMITED +13 카드를 소모해야 합니다.');
assert.match(server,/INSERT INTO user_cards\(user_id,card_id,quantity/,'보상 대상에게 ZENITH 카드를 지급해야 합니다.');
assert.match(server,/100,1,1/,'보상 로그는 천장 성공으로 기록해야 합니다.');

const client=fs.readFileSync(new URL('../js/evolution.js',import.meta.url),'utf8');
const cms=fs.readFileSync(new URL('../admin/evolution-admin.js',import.meta.url),'utf8');
assert.doesNotMatch(client,/ZENITH[^\n]{0,300}천장 없음/);
assert.match(client,/7번째 도전 확정/);
assert.match(cms,/천장<\/small><b>7회<\/b>/);

console.log('ZENITH evolution V1718: 7th attempt guaranteed and legacy 7-failure compensation guarded');
