import {mountContractRoom} from './mercenary-bloodmoon-pack-live.mjs';
import {BLUE_GEAR_PACK,BLUE_GEAR_DRAW_POLICY} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {BlackcrownOpeningSession} from '../shared/mercenary-blackcrown-session-v2.mjs';
import {blackcrownReceiptResults} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {BlackcrownReceiptRecovery,blackcrownReceiptRetryable} from '../shared/mercenary-blackcrown-recovery-v1.mjs';

const pack={...BLUE_GEAR_PACK,imageSmall:'assets/ui/packs/blue-gear-live-v1/pack-320.webp'};
const profile={
 pack,skin:'blue-gear-skin',stockEvent:'blue-gear-pack:stock',requireAccount:true,cards:BLUE_GEAR_DRAW_POLICY.pool,
 theme:{
  brand:'BLUE GEAR',edition:'블루기어',contract:'블루기어의 계약',
  roster:['블루기어 SS 5종 · 각 10장','SSS 리미티드 제로 · 하쿠야 신 · 각 3장','일반 SSS 라자크 · 한도 없음'],
  rules:'SSS에 당첨되면 블루기어 SS 5종, SSS 리미티드 제로·하쿠야 신, 별도 SSS 라자크, 일반 SSS 중에서 한 번 더 추첨합니다.',
  legendTitle:'SSS 리미티드 · 제로 · 하쿠야 신',legendLabel:'팩 한도 각 3장',
  ownershipScale:'0~1종 기본 · 2종 ½ · 3종 ¼ · 4종 ⅛ · 5종 보유 시 SS 획득 종료',ownershipName:'블루기어',
  saleLabel:'11월 20일 00:00 판매 시작 · 한국시간',showRankRates:true
 },
 createSession:options=>new BlackcrownOpeningSession({...options,pack,drawPolicy:BLUE_GEAR_DRAW_POLICY}),
 receiptResults:receipt=>blackcrownReceiptResults(receipt,pack,BLUE_GEAR_DRAW_POLICY),
 Recovery:BlackcrownReceiptRecovery,retryable:blackcrownReceiptRetryable
};
export function openBlueGearPack(options){
 if(!document.querySelector('link[data-blue-gear-style]')){
  const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/css/blue-gear-pack-v1.css?v=20261113-contract1';
  sheet.dataset.blueGearStyle='';document.head.append(sheet);
 }
 return mountContractRoom(profile,options);
}
