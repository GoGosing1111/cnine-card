
const prizes=[
  {key:'COIN',label:'코인',range:'1,000억 ~ 3조',min:200,max:6000,unit:500000000,symbol:'C',color:0xffd477,amount:3000000000000},
  {key:'EMPEROR_ENERGY',label:'엠퍼러 에너지',range:'5 ~ 25개',symbol:'E',color:0xffdf91,amount:25},
  {key:'MASTER_STAR',label:'마스터의 별',range:'5,000 ~ 5,000,000개',symbol:'S',color:0xffe7a6,amount:5000000},
  {key:'STARLIGHT_ARMOR_CORE',label:'미스틱 에너지',range:'5 ~ 5,000개',symbol:'M',color:0xc5a5ff,amount:5000},
  {key:'PINGDU_THANKS_GIFT_BOX',label:'핑두의 감사 선물',range:'5개',symbol:'G',color:0xff91c2,amount:5},
  {key:'PINGDU_REPAIR_COUPON',label:'핑두 리페어 쿠폰',range:'1개',symbol:'R',color:0xffbca0,amount:1}
].map(p=>{const weight={COIN:18000,EMPEROR_ENERGY:1500,MASTER_STAR:4200,STARLIGHT_ARMOR_CORE:3000,PINGDU_THANKS_GIFT_BOX:300,PINGDU_REPAIR_COUPON:3000}[p.key];return {...p,weight,percent:weight/300}});
const select=document.querySelector('#previewPrize');select.innerHTML=prizes.map(p=>`<option value="${p.key}">${p.label}</option>`).join('');
const history=[],receipts=new Map();let tickets=10;
const transport=async(path,body)=>{
  if(path==='state')return {serverNow:new Date().toISOString(),couponTtlHours:8,access:{allowed:true,isOwner:false},dailyAllowance:{enabled:true,quantity:10,couponUses:150},defaultCouponUses:150,tickets,nextCouponUses:tickets?150:0,prizes,history};
  if(path==='spin'){
    if(receipts.has(body.requestId))return {...receipts.get(body.requestId),replayed:true};
    if(tickets<=0)throw Object.assign(new Error('리버스랜드는 하루 최대 10회 이용할 수 있습니다.'),{status:409});
    const prize={...prizes.find(p=>p.key===select.value),jackpot:select.value!=='PINGDU_REPAIR_COUPON'};
    const createdAt=new Date().toISOString(),expiresAt=new Date(Date.parse(createdAt)+8*60*60*1000).toISOString();
    const result={ok:true,requestId:body.requestId,prize,delivery:'VIEWER_COUPON',code:'DEMO-NOT-A-VALID-COUPON',couponUses:150,createdAt,expiresAt,expired:false};
    tickets--;history.unshift(result);receipts.set(body.requestId,result);return result;
  }
  throw new Error('프리뷰에서는 운영 설정을 변경할 수 없습니다.');
};
await window.SoopketLand.preview(transport,document.querySelector('#previewRoot'));
