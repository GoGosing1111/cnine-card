import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SHOP_TAX_BPS,
  TREASURY_RESERVE_BPS,
  calculateShopTax,
  equalClanDistribution,
  isTreasuryFinalApprover,
  proposalLimit,
  treasurySpendable
} from '../functions/_administration_treasury.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const [backend,api,prime,avatar,superstar,prediction,predictionUi,predictionModel,app,menu,router,index,worker]=await Promise.all([
  read('functions/_administration_treasury.js'),read('functions/api/[[path]].js'),read('functions/_prime_draw.js'),read('functions/_avatar.js'),read('functions/_superstar_pack.js'),read('functions/_coin_prediction.js'),read('js/coin-prediction-v2033.js'),read('js/coin-prediction-model-v2033.js'),read('js/app.js'),read('js/soopketmon-v21-exact-shell-adapter.js'),read('js/soopketmon-v21-runtime-router.js'),read('index.html'),read('service-worker.js')
]);

test('실제 코인 판매액 세율은 정확히 1%이며 원 단위 미만은 버린다',()=>{
  assert.equal(SHOP_TAX_BPS,100);
  assert.equal(calculateShopTax(100_000),1_000);
  assert.equal(calculateShopTax(1_000_000),10_000);
  assert.equal(calculateShopTax(99_999),999);
  assert.equal(calculateShopTax(99),0);
  assert.equal(calculateShopTax(-100),0);
  assert.match(backend,/return Math\.floor\(gross\/100\)/);
  const taxBlock=backend.slice(backend.indexOf('export function shopTaxStatements'),backend.indexOf('async function activeChief'));
  assert.doesNotMatch(taxBlock,/UPDATE users SET coin=coin-/,'세금 적립이 구매자 코인을 추가 차감하면 안 된다');
});

test('운영 PostgreSQL은 BIGINT 고정 스키마를 execSchema로 먼저 생성한다',()=>{
  assert.match(backend,/const idType=postgres\?'BIGINT':'INTEGER',amountType=postgres\?'BIGINT':'INTEGER'/);
  assert.match(backend,/postgres&&typeof db\.execSchema==='function'\)await db\.execSchema\(schema\)/);
  assert.match(backend,/to_char\(timezone\('UTC',CURRENT_TIMESTAMP\)/);
});

test('의무 보유 예산과 항목별 상한 때문에 전액 집행할 수 없다',()=>{
  assert.equal(TREASURY_RESERVE_BPS,2000);
  assert.deepEqual(treasurySpendable(1_000_000),{balance:1_000_000,reserve:200_000,spendable:800_000});
  assert.equal(proposalLimit(1_000_000,'PERSONAL').limit,80_000);
  assert.equal(proposalLimit(1_000_000,'PREDICTION_SUBSIDY').limit,240_000);
  assert.equal(proposalLimit(1_000_000,'TOP_CLAN_DIVIDEND').limit,400_000);
});

test('1위 클랜 지급은 1/N 정수 분배하고 나머지는 금고에 남긴다',()=>{
  assert.deepEqual(equalClanDistribution(100,3),{memberCount:3,perMember:33,executedAmount:99,remainder:1});
  assert.deepEqual(equalClanDistribution(100,0),{memberCount:0,perMember:0,executedAmount:0,remainder:100});
  assert.match(backend,/FROM clan_members WHERE season_id=\? AND clan_id=\?/);
});

test('최종 승인자는 OWNER 핑크빛유두 한 계정으로 고정된다',()=>{
  assert.equal(isTreasuryFinalApprover({role:'OWNER',nickname:'핑크빛유두'}),true);
  assert.equal(isTreasuryFinalApprover({role:'OWNER',nickname:'다른OWNER'}),false);
  assert.equal(isTreasuryFinalApprover({role:'USER',nickname:'핑크빛유두'}),false);
  assert.match(backend,/최종 승인은 OWNER \$\{FINAL_APPROVER_NICKNAME\}만/);
  assert.match(backend,/status='PENDING'/);
  assert.match(backend,/status='APPROVING'/);
});

test('정상 완료되는 활성 코인 상점에만 1% 원자 영수증이 연결된다',()=>{
  assert.match(api,/sourceType:'CARD_PACK'[\s\S]*?grossCoin:cost/);
  assert.match(prime,/sourceType:product\.kind==='equipment'\?'PRIME_EQUIPMENT':'PRIME_VEHICLE'[\s\S]*?grossCoin:totalPrice/);
  assert.match(avatar,/sourceType:'AVATAR_SHOP'[\s\S]*?grossCoin:price/);
  assert.match(superstar,/sourceType:'CARD_PACK'[\s\S]*?grossCoin:cost/);
  for(const source of [api,prime,avatar,superstar])assert.match(source,/shopTaxStatements/);
  assert.match(backend,/PRIMARY KEY\(source_type,source_request_id\)/,'원 판매 요청당 한 번만 징수해야 한다');
  assert.match(backend,/status='PENDING'/);
});

test('비상점 코인 소모는 과세 경로에 포함하지 않는다',async()=>{
  for(const path of ['functions/_auction.js','functions/_workshop.js','functions/_evolution.js']){
    const source=await read(path);assert.doesNotMatch(source,/shopTaxStatements/,`${path} must remain outside shop tax scope`);
  }
});

test('승부예측 지원금은 예상 배당과 정산에 포함되고 무효 시 금고로 환입된다',()=>{
  assert.match(prediction,/baseDistributable\+treasurySubsidy/);
  assert.match(prediction,/predictionSubsidyFinalizationStatements/);
  assert.match(backend,/status='REFUNDED'/);
  assert.match(predictionModel,/Math\.floor\(pool \* \(100 - fee\) \/ 100\) \+ support/);
  assert.match(predictionUi,/행정부 지원/);
});

test('전체 메뉴 행정부와 반응형 게임 내 승인 UI가 연결된다',()=>{
  assert.match(menu,/administration: Object\.freeze\(\{ title: '행정부', routes: Object\.freeze\(\['treasury', 'soopketland', 'prison'\]\) \}\)/);
  assert.match(menu,/treasury: Object\.freeze\(\{ title: '세금징수', group: 'administration', icon: 'treasury' \}\)/);
  assert.match(router,/treasury: \{ shell: 'treasury' \}/);
  assert.match(app,/administration-treasury-v2030\.js\?v=2030-tax-one-percent/);
  assert.match(app,/window\.bindAdministrationTreasuryView/);
  assert.match(index,/js\/app\.js\?v=2053-player-calling-card-empty-fx/);
  assert.match(worker,/soop-card-shell-v2053-player-calling-card-empty-fx/);
});
