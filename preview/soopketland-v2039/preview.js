
const prizes=[
  {key:'COIN',label:'코인',range:'1억 ~ 50억',min:1,max:50,unit:100000000,symbol:'C',color:0xffd477,amount:5000000000},
  {key:'SUPERSTAR_GUARANTEED_PACK',label:'슈퍼스타팩 확정권',range:'1개 · 슈퍼스타 100%',symbol:'SS',color:0xffdf91,amount:1},
  {key:'MASTER_STAR',label:'마스터의 별',range:'1,000 ~ 30,000개',symbol:'S',color:0xffe7a6,amount:30000},
  {key:'BLACK_MIRACLE_PACK',label:'블랙미라클 카드',range:'10 ~ 20개',symbol:'B',color:0xbc91ff,amount:20},

  {key:'STARLIGHT_ARMOR_CORE',label:'미스틱 에너지',range:'1 ~ 50개',symbol:'M',color:0xc5a5ff,amount:50}
].map(p=>{const weight=p.key==='SUPERSTAR_GUARANTEED_PACK'?1500:p.key==='STARLIGHT_ARMOR_CORE'?3000:p.key==='BLACK_MIRACLE_PACK'?5668:9916;return {...p,weight,percent:weight/300}});
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
