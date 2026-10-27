export const CLASSIC_VERSION = 'classic-colosseum-20261027-v1';
export const CLASSIC_LEVEL = 10;
export const CLASSIC_GRADES = Object.freeze(['C','U','R','SR','HR','UR','SSR','MA','LIMITED','PRESTIGE','ZENITH']);
export const CLASSIC_RULES = Object.freeze({version:CLASSIC_VERSION,level:10,cardCount:5,magicSlots:5,grades:CLASSIC_GRADES,equipment:false,mercenaries:false,pets:false,battleSuits:false,accountBonuses:false,rewards:false});
export const CLASSIC_KEYS = Object.freeze({settings:'classic_colosseum_settings_v1',rooms:'classic_colosseum_rooms_v1',news:'classic_colosseum_news_v1'});
export const classicError = (code,message,status=409) => Object.assign(new Error(message),{code:'CLASSIC_'+code,status});
export const classicRoomKey = id => 'classic_colosseum_room_v1:'+classicId(id);
export const classicResultKey = id => 'classic_colosseum_result_v1:'+classicId(id);
export const classicUserKey = id => 'classic_colosseum_user_v1:'+classicUserId(id);
export function classicId(value){if(typeof value!=='string'||!/^[-a-zA-Z0-9_]{16,80}$/.test(value))throw classicError('ID','경기 요청 번호를 확인하세요.',400);return value;}
export function classicUserId(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw classicError('USER','참가자 ID를 확인하세요.',400);return n;}
export function classicSettings(value={}){value??={};return {enabled:value.enabled===true,revision:Number(value.revision)||0,epoch:Number(value.epoch)||0,updatedAt:value.updatedAt||null};}
export function classicPhase(room,settings,now=Date.now()){
 if(!room)return null;
 if(['COMPLETED','DECLINED','CANCELLED'].includes(room.status))return room.status;
 if(room.epoch!==settings.epoch||!settings.enabled)return 'CANCELLED';
 if(room.status==='FIGHTING'&&room.input)return 'FIGHTING';
 if(Date.parse(room.expiresAt)<=now)return 'EXPIRED';
 return room.status;
}
export const classicActive = (room,settings,now) => ['INVITED','SETUP','READY','FIGHTING'].includes(classicPhase(room,settings,now));
export function classicEligibleCard(card){return !!card&&CLASSIC_GRADES.includes(String(card.rarity).toUpperCase())&&Number(card.is_active)===1&&String(card.card_status||'PUBLIC').toUpperCase()==='PUBLIC';}
export function classicLoadout(input,catalog){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['cardIds','magicCardIds'].includes(k)))throw classicError('LOADOUT','카드와 마법카드만 대여 편성할 수 있습니다. 장비는 사용할 수 없습니다.',400);
 const select=(ids,items,min,max,label)=>{
  if(!Array.isArray(ids)||ids.length<min||ids.length>max||ids.some(id=>!['string','number'].includes(typeof id))||new Set(ids.map(String)).size!==ids.length)throw classicError('LOADOUT',label+' 수량과 중복을 확인하세요.',400);
  const selected=ids.map(id=>items.find(row=>String(row.id)===String(id)));
  if(selected.some(row=>!row))throw classicError('RENTAL_ONLY','현재 대여 가능한 '+label+'만 편성할 수 있습니다.',400);
  return selected;
 };
 const cards=select(input.cardIds,catalog.cards,5,5,'카드 5장'),magic=select(input.magicCardIds??[],catalog.magic,0,5,'마법카드');
 return {cardIds:cards.map(c=>String(c.id)),magicCardIds:magic.map(c=>Number(c.id))};
}
export function classicArticle(room,battle,at){
 const side=battle.result.winner;
 if(!['A','B'].includes(side))throw classicError('RESULT','서버 승패를 확인할 수 없습니다.',500);
 const winner=room.players[side==='A'?0:1],loser=room.players[side==='A'?1:0];
 const lines=[
  ['의 전략, 콜로세움에서 실종','전략은 입장했지만, 승리는 퇴장했습니다.'],
  ['의 자신감, 경기장에 두고 퇴근','대여 카드는 +10. 오늘의 변명도 +10.'],
  ['의 승리 선언, 속보로 철회','카드는 공평했습니다. 결과는 공평하지 않았습니다.'],
  ['의 작전 회의, 긴급 재소집','패배는 잠깐, 오늘의 1면은 오래갑니다.']
 ];
 const [headline,taunt]=lines[(Number(room.seed)>>>0)%lines.length];
 return {id:room.id,matchId:room.id,paper:'콜로세움 일보',title:loser.nickname+headline,taunt,winnerId:winner.id,winnerName:winner.nickname,loserId:loser.id,loserName:loser.nickname,publishedAt:at,body:`${winner.nickname}, ${loser.nickname}에게 승리. 모든 참가자가 같은 +10 대여 조건으로 겨룬 클래식 멸망전에서 승부가 갈렸습니다.`,actions:Number(battle.result.actions||battle.result.actionCount||0)};
}
