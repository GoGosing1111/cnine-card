import {ICON_CARD_ROSTER} from './icon-card-roster-v1.mjs';

// Public browsing stays available. Synthesis needs explicit ON after final review.
export const ICON_FUSION_RELEASE_ENABLED = true;
export const ICON_FUSION_POLICY = Object.freeze({
  version:2, coinCost:500000000000, masterStarCost:5000000,
  superstarCount:1, furCount:1, enhancementLevel:13,
  successChancePpm:100000, chanceTotal:1000000, successRate:10,
  resultMode:'SELECT', consumeOnFailure:true, pityAttempts:0, basePower:180000,
  enhancementEnabled:false, materialsResetRemainingEnhancement:true
});
export const ICON_LIVE_CARDS = Object.freeze(ICON_CARD_ROSTER.map((card,index)=>Object.freeze({
  ...card,cardId:`CN-1C00000${index+1}`,grade:'ICON',basePower:180000,releaseEnabled:true
})));
export const ICON_FUSION_SETTINGS_KEY='icon_fusion_settings_v1';
export const ICON_FUSION_DEFAULT_SETTINGS=Object.freeze({revision:1,enabled:false,successVideoUrl:'',successVideoDurationMs:12000});
export function validateIconVideoUrl(value){
  if(typeof value!=='string'||value.length>500)throw Error('영상 경로를 확인해 주세요.');
  if(!value)return '';
  if(!/^\/?assets\/[A-Za-z0-9_./-]+\.(?:mp4|webm)$/i.test(value)||value.split('/').some(part=>part==='..'||part==='.')||value.includes('//'))throw Error('assets/ 안의 MP4 또는 WebM 영상 경로를 입력해 주세요.');
  return '/'+value.replace(/^\//,'');
}
export function formatIconAmount(value){
  let n;try{n=BigInt(typeof value==='number'?Math.max(0,Math.floor(value)):String(value||0));}catch{return '0';}
  if(n<=0n)return '0';
  const units=['','만','억','조','경'];let i=0,parts=[];
  while(n>0n&&i<units.length){const group=Number(n%10000n);if(group)parts.unshift(`${group>=1000&&group%1000===0?`${group/1000}천`:group.toLocaleString('ko-KR')}${units[i]}`);n/=10000n;i++;}
  return parts.join(' ');
}
