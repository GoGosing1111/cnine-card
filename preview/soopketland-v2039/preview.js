const HYPER='SOOPKETLAND_HYPER_BURNING_TICKET';
const prizes=[
  {key:'COIN',label:'코인',range:'1억 ~ 5억',symbol:'C',color:0xffd477,amount:500000000},
  {key:'HIGH_GRADE_REROLL_TICKET',label:'고등급 재뽑기권',range:'1개',symbol:'R',color:0xdbb8ff,amount:1},
  {key:'MASTER_STAR',label:'마스터의 별',range:'1,000 ~ 5,000개',symbol:'S',color:0xffe7a6,amount:3000},
  {key:'BLACK_MIRACLE_PACK',label:'블랙미라클 카드',range:'1 ~ 3개',symbol:'B',color:0xbc91ff,amount:3},
  {key:HYPER,label:'하이퍼버닝 발동권',range:'서버 전체 ×15 · 60분',symbol:'15',color:0xff8059,amount:1},
  {key:'ZENITH_RANDOM_CARD',label:'제니스 랜덤카드',range:'1장',symbol:'Z',color:0x90ebff,amount:1},
  {key:'FUR_RANDOM_CARD',label:'FUR 랜덤카드',range:'1장',symbol:'F',color:0xffb5d9,amount:1}
].map(p=>({...p,weight:10,percent:100/7}));
const select=document.querySelector('#previewPrize');select.innerHTML=prizes.map(p=>`<option value="${p.key}">${p.label}</option>`).join('');
const history=[],receipts=new Map();let tickets=12;
const transport=async(path,body)=>{
  if(path==='state')return {access:{allowed:true,isOwner:false},tickets,nextCouponUses:1,prizes,history};
  if(path==='spin'){
    if(receipts.has(body.requestId))return {...receipts.get(body.requestId),replayed:true};
    const prize={...prizes.find(p=>p.key===select.value),jackpot:select.value!=='HIGH_GRADE_REROLL_TICKET'},direct=prize.key===HYPER;
    const result={ok:true,requestId:body.requestId,prize,delivery:direct?'STREAMER_INVENTORY':'VIEWER_COUPON',code:direct?null:'DEMO-NOT-A-VALID-COUPON',couponUses:direct?0:1,createdAt:new Date().toISOString()};
    tickets--;history.unshift(result);receipts.set(body.requestId,result);return result;
  }
  throw new Error('프리뷰에서는 운영 설정을 변경할 수 없습니다.');
};
await window.SoopketLand.preview(transport,document.querySelector('#previewRoot'));
