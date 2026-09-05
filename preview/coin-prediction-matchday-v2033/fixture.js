(() => {
  const cats=window.CoinPredictionModel.categories,query=new URLSearchParams(location.search),receipts=new Map();
  const stats={bets:0,requests:[],categorySaves:0};let wallet=12765000000;
  const sample=[['SOCCER','토트넘 vs 아스널','토트넘 승리','무승부','아스널 승리'],['LOL','T1 vs Gen.G · 결승전','T1 승리','Gen.G 승리'],['BASEBALL','LG 트윈스 vs KIA 타이거즈','LG 승리','KIA 승리'],['BASKETBALL','서울 SK vs 부산 KCC','서울 SK 승리','부산 KCC 승리'],['SETKA','세트카 · 이바노프 vs 페트로프','이바노프 승리','페트로프 승리'],['STARCRAFT','스타 · 테란 vs 저그','테란 승리','저그 승리'],['OTHER','영토전 · 희야파 vs 히나파','희야파 승리','히나파 승리']];
  const events=Array.from({length:16},(_,i)=>{
    const [category,title,...labels]=sample[i%sample.length],id=i+1;
    const options=labels.map((label,j)=>({id:id*10+j+1,label,total_bet:[2800000000,700000000,4900000000][j]||3000000000,bet_count:[74,21,128][j],bettors:[{nickname:'테스트 참여자 A',amount:500000000},{nickname:'긴 닉네임 시인성 확인용 참여자',amount:250000000},{nickname:'배팅 확인',amount:125000000}]}));
    return {id,category,title:i>=sample.length?`${title} · ${i+1}경기`:title,description:i===0?'정규 시간 종료 기준 승리 팀을 예측하세요. 연장전과 승부차기는 포함하지 않습니다.':'최종 경기 결과를 기준으로 정산합니다.',image_url:i===0?'assets/ui/coin-prediction/arena-v1.png':'',status:'OPEN',closes_at:new Date(Date.now()+(i+1)*1800000).toISOString(),total_pool:options.reduce((n,o)=>n+o.total_bet,0),treasury_subsidy:i===0?300000000:0,fee_percent:10,min_bet:100000,max_bet:500000000,participant_count:223,options,myBet:i===0||i===3?{event_id:id,option_id:options[0].id,amount:50000000,payout:0,status:'ACTIVE'}:null};
  });
  for(const [i,status,payout]of [[17,'SETTLED',135000000],[18,'VOID',50000000],[19,'SETTLED',0],[20,'CLOSED',0]]){
    const e=structuredClone(events[(i-17)%events.length]);e.id=i;e.title=`${e.title} · 종료 경기`;e.status=status;e.options=e.options.map((o,j)=>({...o,id:i*10+j+1}));e.result_option_id=status==='SETTLED'?e.options[payout?0:1].id:null;e.myBet={event_id:i,option_id:e.options[0].id,amount:50000000,payout,status:status==='VOID'?'REFUNDED':status==='SETTLED'?'SETTLED':'ACTIVE'};e.closes_at=new Date(Date.now()-3600000).toISOString();events.push(e);
  }
  const terms={version:'preview-2033',title:'숲켓몬 코인 승부예측 이용 규정',items:['숲켓몬 코인은 현금·환전 가치가 없는 게임 내 가상 재화입니다.','1회 최소 10만, 경기당 누적 최대 5억 코인입니다. OWNER는 보유 코인 내에서 자유롭게 참여합니다.','최초 선택 항목은 변경하거나 취소할 수 없습니다. 같은 항목으로만 추가 배팅할 수 있습니다.','수수료 10% 차감 후 행정부 지원금을 합산하고 적중자의 참여 비율에 따라 배분합니다. 예상값은 마감 전까지 변동됩니다.','무효 처리 시 배팅 원금을 전액 환불합니다.']};
  function snapshot(path){
    const url=new URL(path,'https://preview.test/'),view=url.searchParams.get('view')==='history'?'history':'active',category=url.searchParams.get('category')||'ALL',mine=url.searchParams.get('mine')==='1',size=path.startsWith('admin/')?30:12;
    const available=query.has('empty')?[]:events.filter(e=>!mine||e.myBet),matches=e=>(category==='ALL'||e.category===category),active=e=>e.status==='OPEN';
    const categoryCounts={ALL:0,...Object.fromEntries(cats.map(c=>[c.code,0]))};
    for(const e of available.filter(e=>(view==='active')===active(e))){categoryCounts[e.category]++;categoryCounts.ALL++;}
    const counts={active:available.filter(e=>active(e)&&matches(e)).length,history:available.filter(e=>!active(e)&&matches(e)).length},list=available.filter(e=>matches(e)&&(view==='active')===active(e)),totalPages=Math.max(1,Math.ceil(list.length/size)),page=Math.max(1,Math.min(Number(url.searchParams.get('page')||1),totalPages));
    return {settings:{enabled:!query.has('paused'),ownerUnlimited:query.has('owner'),pollSeconds:15,feePercent:10,minBet:100000,maxBetPerEvent:500000000,todayChampion:{nickname:'매치데이 챔피언',netProfit:842500000}},walletCoin:wallet,serverNow:new Date().toISOString(),navigation:{view,page,pageSize:size,total:list.length,totalPages,counts,category,mine,categoryCounts,historyRetentionHours:24},terms,events:structuredClone(list.slice((page-1)*size,page*size))};
  }
  async function api(path,options={}){
    stats.requests.push(path);await new Promise(r=>setTimeout(r,80));
    if(query.has('error'))throw new Error('검수용 연결 실패');
    if(path.includes('/state'))return snapshot(path);
    const b=JSON.parse(options.body||'{}');
    if(path==='coin-prediction/bet'){
      if(receipts.has(b.requestId))return {...receipts.get(b.requestId),replayed:true};
      const e=events.find(e=>e.id===b.eventId),o=e?.options.find(o=>o.id===b.optionId);if(!o)throw new Error('항목 없음');
      if(e.myBet&&e.myBet.option_id!==o.id)throw new Error('선택 변경 불가');
      const total=(e.myBet?.amount||0)+b.amount;if(b.amount<100000||(!query.has('owner')&&total>500000000)||b.amount>wallet)throw new Error('금액 오류');
      wallet-=b.amount;e.total_pool+=b.amount;o.total_bet+=b.amount;e.myBet={event_id:e.id,option_id:o.id,amount:total,status:'ACTIVE',payout:0};stats.bets++;
      const result={ok:true,state:snapshot('coin-prediction/state')};receipts.set(b.requestId,result);return result;
    }
    if(path==='admin/coin-prediction/category'){const e=events.find(e=>e.id===b.eventId);e.category=b.category;stats.categorySaves++;return {ok:true};}
    if(path==='admin/coin-prediction/settings')return {ok:true,settings:{...snapshot('coin-prediction/state').settings,...b}};
    if(path==='admin/coin-prediction/event'){const id=events.length+1,e={...structuredClone(events[1]),id,title:b.title,category:b.category,description:b.description,closes_at:b.closesAt,myBet:null,total_pool:0,participant_count:0,options:b.options.map((label,j)=>({id:id*10+j,label,total_bet:0,bet_count:0,bettors:[]}))};events.unshift(e);return {ok:true,id,state:snapshot('admin/coin-prediction/state')};}
    if(path==='admin/coin-prediction/action'){const e=events.find(e=>e.id===b.eventId);e.status=b.action==='CLOSE'?'CLOSED':b.action==='VOID'?'VOID':'SETTLED';return{ok:true,state:snapshot('admin/coin-prediction/state?view=history')};}
    throw new Error('검수 화면에서 지원하지 않는 경로');
  }
  window.apiRequest=api;window.PredictionPreview={stats,events,snapshot};
  if(location.pathname.endsWith('/admin.html'))window.fetch=async(url,options={})=>{const path=String(url).replace(/^.*?api\//,'');try{return new Response(JSON.stringify(await api(path.split('?')[0].endsWith('/state')?path:path.split('?')[0],options)),{headers:{'content-type':'application/json'}});}catch(e){return new Response(JSON.stringify({error:e.message}),{status:400});}};
})();
