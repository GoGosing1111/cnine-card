// Public pack presentation. Season 2 opening remains locked until a separate release.
export const MAGIC_SEASON2_PACK=Object.freeze({
 season:'S2',code:'MAGIC_CARD_SEASON2_PACK',name:'마법카드 시즌2 팩',
 imageUrl:'assets/cards/magic-season2-pack-768-v2.webp',
 drawCoinCost:1_000_000_000,drawCost:0,drawEnabled:false,openingEnabled:false,
 visible:true,status:'PREPARING',rewardPolicy:'MIXED_CARD_MASTER_STAR',purchaseEnabled:false,
 rewardTypes:Object.freeze(['MAGIC_CARD','MASTER_STAR']),
 packRewards:Object.freeze({magicCardChance:5,masterStarChance:10,masterStarMin:null,masterStarMax:null,remainderPolicy:'UNASSIGNED'})
});
// Percentages are absolute chances, never relative weights. Unassigned chance
// and unconfigured quantities keep the draft incomplete even after saving.
export function magicSeason2PackDraft(raw={}){
 const source=raw.packRewards||{},defaults=MAGIC_SEASON2_PACK.packRewards;
 const chance=key=>{
  const value=source[key]===undefined?defaults[key]:source[key];
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw Error('확률은 0~100 사이의 숫자로 입력하세요.');
  return value;
 };
 const amount=key=>{
  const value=source[key];
  if(value==null||value==='')return null;
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)throw Error('마별 수량은 1 이상의 정수로 입력하세요.');
  return value;
 };
 const magicCardChance=chance('magicCardChance'),masterStarChance=chance('masterStarChance');
 if(magicCardChance+masterStarChance>100)throw Error('마법카드와 마별 확률의 합은 100% 이하여야 합니다.');
 const masterStarMin=amount('masterStarMin'),masterStarMax=amount('masterStarMax');
 if(masterStarMin!==null&&masterStarMax!==null&&masterStarMax<masterStarMin)throw Error('마별 최대 수량은 최소 수량 이상이어야 합니다.');
 const remainderPolicy=source.remainderPolicy??defaults.remainderPolicy;
 if(!['UNASSIGNED','NONE'].includes(remainderPolicy))throw Error('남은 확률의 처리 방식을 선택하세요.');
 const remainingChance=Number((100-magicCardChance-masterStarChance).toFixed(10));
 return {...MAGIC_SEASON2_PACK,packRewards:{magicCardChance,masterStarChance,masterStarMin,masterStarMax,remainderPolicy},
  noRewardChance:remainderPolicy==='NONE'?remainingChance:0,
  unassignedChance:remainderPolicy==='UNASSIGNED'?remainingChance:0,
  rewardConfigurationComplete:(remainingChance===0||remainderPolicy==='NONE')&&(masterStarChance===0||(masterStarMin!==null&&masterStarMax!==null))};
}
export function magicSummonSeasons(settings={},season2={}){
 return [
  {season:'S1',code:'MAGIC_CARD_PACK',name:'아르카나 마법카드팩',imageUrl:'assets/cards/magic-card-pack-v2-384.jpg',drawCoinCost:settings.drawCoinCost,drawCost:settings.drawCost,drawEnabled:settings.drawEnabled===true,packRewards:settings.packRewards},
  magicSeason2PackDraft(season2)
 ];
}
export function magicPackRequestGuard(body={}){
 const raw=body?.season,season=raw==null?'S1':String(raw).trim().toUpperCase();
 const codes=[body?.itemCode,body?.packCode].filter(value=>value!=null).map(value=>String(value).trim().toUpperCase());
 if(season==='S2'||season==='2'||codes.includes(MAGIC_SEASON2_PACK.code))return {status:503,body:{error:'마법카드 시즌2는 출시 준비 중입니다. 아직 개봉할 수 없습니다.',code:'MAGIC_SEASON2_OPENING_LOCKED'}};
 if(!['S1','1'].includes(season)||codes.some(code=>code!=='MAGIC_CARD_PACK'))return {status:400,body:{error:'지원하지 않는 마법카드 시즌입니다.',code:'INVALID_MAGIC_SEASON'}};
 return null;
}
