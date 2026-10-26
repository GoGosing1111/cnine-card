export const user={id:4242,serverUserId:4242,nickname:'Store QA',role:'USER',coin:1234567890,cardShards:1234,masterStars:100,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};

export async function mockApi(route,url){
    const key=url.pathname.slice(5);
    return route.fulfill({json:{
     'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},
     'pets/v1/codex':{version:1,userId:4242,cards:[],loadout:{petCode:null,revision:1},canEquip:false,petCmsRevision:1},
     messages:{messages:[{id:1,message_type:'SUPPORT_BANK_ACCOUNT',title:'후원 계좌 안내',body:'은행 계좌 비공개 검수 값',is_read:0,cleanupEligible:1},{id:2,message_type:'SYSTEM',title:'49,800원 패키지 구매 처리',body:'후원 상품 기록',is_read:0,cleanupEligible:1},{id:3,message_type:'SYSTEM',title:'일반 공지 확인',body:'모험을 시작하세요.',is_read:0,cleanupEligible:1}],unread:3,cleanupCount:3},
     'chief/status':{chief:null},'shell/summary':{inventory:{},messages:{unread:3}},'me/menu-favorites':{userId:4242,routes:[]},'live-operations':{items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},
    }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],presets:{},settings:{}}});
}
