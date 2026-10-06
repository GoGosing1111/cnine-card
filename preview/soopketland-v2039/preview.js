
const prizes=[
  {key:'COIN',label:'코인',range:'1억 ~ 500억',min:1,max:500,unit:100000000,symbol:'C',color:0xffd477,amount:50000000000},
  {key:'EMPEROR_ENERGY',label:'엠퍼러 에너지',range:'1 ~ 5개',symbol:'E',color:0xffdf91,amount:5},
  {key:'MASTER_STAR',label:'마스터의 별',range:'1,000 ~ 1,000,000개',symbol:'S',color:0xffe7a6,amount:1000000},
  {key:'STARLIGHT_ARMOR_CORE',label:'미스틱 에너지',range:'1 ~ 1,000개',symbol:'M',color:0xc5a5ff,amount:1000},
  {key:'PINGDU_THANKS_GIFT_BOX',label:'핑두의 감사 선물',range:'1개',symbol:'G',color:0xff91c2,amount:1}
].map(p=>{const weight=p.key==='EMPEROR_ENERGY'?1500:p.key==='STARLIGHT_ARMOR_CORE'?3000:p.key==='PINGDU_THANKS_GIFT_BOX'?300:12600;return {...p,weight,percent:weight/300}});
const select=document.querySelector('#previewPrize');select.innerHTML=prizes.map(p=>`<option value="${p.key}">${p.label}</option>`).join('');
const history=[],receipts=new Map();let tickets=12;
const transport=async(path,body)=>{
  if(path==='state')return {access:{allowed:true,isOwner:false},tickets,nextCouponUses:1,prizes,history};
  if(path==='spin'){
    if(receipts.has(body.requestId))return {...receipts.get(body.requestId),replayed:true};
    const prize={...prizes.find(p=>p.key===select.value),jackpot:select.value!=='HIGH_GRADE_REROLL_TICKET'};
    const result={ok:true,requestId:body.requestId,prize,delivery:'VIEWER_COUPON',code:'DEMO-NOT-A-VALID-COUPON',couponUses:1,createdAt:new Date().toISOString()};
    tickets--;history.unshift(result);receipts.set(body.requestId,result);return result;
  }
  throw new Error('프리뷰에서는 운영 설정을 변경할 수 없습니다.');
};
await window.SoopketLand.preview(transport,document.querySelector('#previewRoot'));
