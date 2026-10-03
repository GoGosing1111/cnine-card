// Public pack presentation. Season 2 opening remains locked until a separate release.
export const MAGIC_SEASON2_PACK=Object.freeze({
 season:'S2',code:'MAGIC_CARD_SEASON2_PACK',name:'마법카드 시즌2 팩',
 imageUrl:'assets/cards/magic-season2-pack-768-v2.webp',
 drawCoinCost:1_000_000_000,drawCost:0,drawEnabled:false,openingEnabled:false,
 visible:true,status:'PREPARING',rewardPolicy:'MIXED_CARD_CRYSTAL_SHARD'
});
export function magicSummonSeasons(settings={}){
 return [
  {season:'S1',code:'MAGIC_CARD_PACK',name:'아르카나 마법카드팩',imageUrl:'assets/cards/magic-card-pack-v2-384.jpg',drawCoinCost:settings.drawCoinCost,drawCost:settings.drawCost,drawEnabled:settings.drawEnabled===true,packRewards:settings.packRewards},
  {...MAGIC_SEASON2_PACK}
 ];
}
export function magicPackRequestGuard(body={}){
 const raw=body?.season,season=raw==null?'S1':String(raw).trim().toUpperCase();
 const codes=[body?.itemCode,body?.packCode].filter(value=>value!=null).map(value=>String(value).trim().toUpperCase());
 if(season==='S2'||season==='2'||codes.includes(MAGIC_SEASON2_PACK.code))return {status:503,body:{error:'마법카드 시즌2는 출시 준비 중입니다. 아직 개봉할 수 없습니다.',code:'MAGIC_SEASON2_OPENING_LOCKED'}};
 if(!['S1','1'].includes(season)||codes.some(code=>code!=='MAGIC_CARD_PACK'))return {status:400,body:{error:'지원하지 않는 마법카드 시즌입니다.',code:'INVALID_MAGIC_SEASON'}};
 return null;
}
