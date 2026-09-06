import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {evaluateUniqueAdvancementEligibility} from '../functions/_unique_advancement.js';

const root=new URL('../',import.meta.url);
const [api,app,bulk,magic,adminEnhancement,legacyAdmin,uniqueServer,uniqueClient,preview,index,adminIndex,serviceWorker]=await Promise.all([
  readFile(new URL('functions/api/[[path]].js',root),'utf8'),
  readFile(new URL('js/app.js',root),'utf8'),
  readFile(new URL('js/bulk-enhancement-v1899.js',root),'utf8'),
  readFile(new URL('functions/_magic.js',root),'utf8'),
  readFile(new URL('admin/admin-v1065-card-management-reorg.js',root),'utf8'),
  readFile(new URL('admin/admin-v1276.js',root),'utf8'),
  readFile(new URL('functions/_unique_advancement.js',root),'utf8'),
  readFile(new URL('js/card-unique-advancement-v1.js',root),'utf8'),
  readFile(new URL('preview/card-unique-advancement-v1/preview.js',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('admin/index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8')
]);

function uppercaseArray(source,name){
  const match=source.match(new RegExp(`const ${name}=\\[([^\\]]+)\\]`));
  assert.ok(match,`${name} declaration missing`);
  return match[1].match(/[A-Z]+/g)||[];
}

test('SUPERSTAR는 전 강화 구간에서 마스터의 별을 사용하고 최대 +13까지 열린다',()=>{
  assert.deepEqual(uppercaseArray(api,'HIGH_BREAKTHROUGH_GRADES'),['MA','LIMITED','FUR','ZENITH','SUPERSTAR']);
  assert.deepEqual(uppercaseArray(api,'ALL_LEVEL_MASTER_STAR_GRADES'),['ZENITH','SUPERSTAR']);
  assert.match(api,/const masterStarStep=ALL_LEVEL_MASTER_STAR_GRADES\.includes\(grade\)\|\|highStep/);
  assert.match(api,/usesMasterStars=ALL_LEVEL_MASTER_STAR_GRADES\.includes\(grade\)\|\|isMasterStarHigh,maxLevel=HIGH_BREAKTHROUGH_GRADES\.includes\(grade\)\?13:10/);
  assert.match(api,/const autoHighBlocked=\['FUR','ZENITH','SUPERSTAR'\]\.includes\(grade\)/);
  assert.match(api,/ALL_LEVEL_MASTER_STAR_GRADES\.includes\(grade\)\?`\$\{grade\}_BREAKTHROUGH_AUTO`/);

  assert.deepEqual(uppercaseArray(app,'HIGH_BREAKTHROUGH_GRADES'),['MA','LIMITED','FUR','ZENITH','SUPERSTAR']);
  assert.ok((app.match(/isSuperstar=normalizedGrade==='SUPERSTAR'/g)||[]).length>=2);
  assert.match(app,/usesMasterStars=isZenith\|\|isSuperstar\|\|isHighStage/);
  assert.match(app,/usesMasterStars=isZenith\|\|isSuperstar\|\|isMaHigh/);
});

test('SUPERSTAR +11~+13 비용·확률·천장·고유효과는 유지하고 전투력 비교 표는 호환된다',()=>{
  assert.match(api,/return \{FUR,ZENITH,SUPERSTAR:ZENITH\}/);
  assert.match(api,/if\(g==='ZENITH'\|\|g==='SUPERSTAR'\)return zenithMasterStarBreakthroughConfig\(env\)/);
  assert.match(api,/highBreakthroughBonus\.SUPERSTAR=\[\.\.\.highBreakthroughBonus\.ZENITH\]/);
  assert.match(api,/key==='SUPERSTAR'\?'ZENITH':key/);
  assert.match(api,/superstarHigh:zenithHigh/);

  assert.match(app,/if\(key==='SUPERSTAR'\)return user\?\.zenithHighBreakthrough\|\|ZENITH_HIGH_ENHANCEMENT_FALLBACK/);
  assert.match(app,/sharedKey=key==='SUPERSTAR'\?'ZENITH':key/);
  assert.match(app,/HIGH_BREAKTHROUGH_BONUS_FALLBACK=\{FUR:\[1400,1900,2500\],ZENITH:\[709,973,1275\]\}/);

  assert.match(magic,/HIGH_UNIQUE_BOOST_FALLBACK=\{FUR:\[30,60,100\],ZENITH:\[20,40,60\]\}/);
  assert.match(magic,/value\.SUPERSTAR=\[\.\.\.value\.ZENITH\]/);
  assert.match(magic,/\['FUR','ZENITH','SUPERSTAR'\]\.includes\(grade\)/);

  assert.match(adminEnhancement,/const HIGH_GRADES=\['MA','LIMITED','FUR','ZENITH','SUPERSTAR'\]/);
  assert.match(adminEnhancement,/if\(grade==='ZENITH'\|\|grade==='SUPERSTAR'\)return data\.zenithHigh/);
  assert.match(adminEnhancement,/\['ZENITH','SUPERSTAR'\]\.includes\(current\)\?'마스터의 별 비용'/);
  assert.match(legacyAdmin,/materialLabel=\['ZENITH','SUPERSTAR'\]\.includes\(grade\)\?'필요 마스터의 별'/);
  assert.match(api,/ORDER BY CASE UPPER\(c\.rarity\) WHEN 'SUPERSTAR' THEN 1 WHEN 'ZENITH' THEN 2/);
});

test('일괄 강화는 SUPERSTAR +10까지만 처리하고 +11부터 상세 수동 강화로 넘긴다',()=>{
  assert.match(bulk,/isHighManualOnly=card=>\['FUR','ZENITH','SUPERSTAR'\]\.includes\(cardGrade\(card\)\)/);
  assert.match(bulk,/usesMasterStars=\(card,level\)=>\['ZENITH','SUPERSTAR'\]\.includes\(cardGrade\(card\)\)/);
  assert.match(bulk,/FUR·ZENITH·SUPERSTAR \+11~\+13/);
  assert.match(bulk,/FUR·ZENITH·SUPERSTAR는 \+10까지만/);
  assert.match(app,/autoHighPolicyBlocked=\['FUR','ZENITH','SUPERSTAR'\]\.includes\(normalizedGrade\)&&level>=10/);
});

test('SUPERSTAR +13은 서버와 클라이언트에서 고유효과 전직 대상이다',()=>{
  assert.match(uniqueServer,/UNIQUE_ADVANCEMENT_ALLOWED_GRADES=Object\.freeze\(\['FUR','ZENITH','SUPERSTAR'\]\)/);
  assert.match(uniqueClient,/ELIGIBLE_GRADES=Object\.freeze\(\['FUR','ZENITH','SUPERSTAR'\]\)/);
  assert.match(preview,/eligibleGrades:\['FUR','ZENITH','SUPERSTAR'\]/);

  const eligibility=evaluateUniqueAdvancementEligibility({
    card:{quantity:1,rarity:'SUPERSTAR',breakthrough_level:13,unique_card_id:'superstar-unique',unique_is_active:1,attack_percent:24,defense_percent:8,speed_percent:6,hp_percent:4},
    masterStars:3000,
    featureEnabled:true
  });
  assert.equal(eligibility.eligible,true);
  assert.equal(eligibility.grade,'SUPERSTAR');
  assert.equal(eligibility.recommendedClass.classCode,'SHATTER');
});

test('SUPERSTAR +11~+13은 챔피언십 프레임과 강화 자산을 유지하며 변경된 앱만 캐시 갱신한다',()=>{
  assert.deepEqual(uppercaseArray(app,'TIER_FRAME_GRADES'),['FUR','ZENITH','SUPERSTAR']);
  assert.match(app,/SUPERSTAR:\{11:'',12:'',13:''\}/);
  assert.match(app,/normalizedGrade==='SUPERSTAR'\?'<img class="superstar-card-frame"/);

  for(const asset of ['js/bulk-enhancement-v1899.js']){
    assert.match(index,new RegExp(`${asset.replaceAll('.','\\.')}\\?v=1941-superstar-pack-early-access`));
  }
  assert.match(index,/js\/card-unique-advancement-v1\.js\?v=2043-advancement-pass/);
  for(const asset of ['admin-v1065-card-management-reorg.js','admin-v1170-user-card-grant.js']){
    assert.match(adminIndex,new RegExp(`${asset.replaceAll('.','\\.')}\\?v=1941-superstar-pack-early-access`));
  }
  assert.match(index,/js\/app\.js\?v=2048-boss-signatures/);
  assert.match(adminIndex,/admin-v1276\.js\?v=2034-superstar-power-deck/);
  assert.match(serviceWorker,/SHELL_CACHE='soop-card-shell-v2048-boss-signatures'/);
});
