(()=>{
  const now=Date.now(),stamp=n=>new Date(now+n).toISOString();
  const teams=[{seed:1,clanId:9,name:'DK',markKey:'DK',primaryColor:'#2de1c2',score:21},
    {seed:2,clanId:6,name:'한화',markKey:'HANWHA',primaryColor:'#f38a32',score:18},
    {seed:3,clanId:2,name:'삼성',markKey:'SAMSUNG',primaryColor:'#5784ef',score:15}];
  let view=new URLSearchParams(location.search).get('case')||'semi';
  function fixture(){
    const upcoming=view==='upcoming',complete=view==='complete',final=view==='final'||complete;
    const semi={id:101,stage:'SEMIFINAL',status:final?'COMPLETED':'ACTIVE',clanAId:6,clanBId:2,scoreA:final?348:236,scoreB:final?310:218,startsAt:stamp(-1800000),endsAt:stamp(1800000),winnerClanId:final?6:0};
    const finalMatch={id:102,stage:'FINAL',status:complete?'COMPLETED':'ACTIVE',clanAId:9,clanBId:6,scoreA:complete?401:202,scoreB:complete?422:216,startsAt:stamp(-1200000),endsAt:stamp(2400000),winnerClanId:complete?6:0};
    return{verified:true,season:{id:7,seasonNo:4,phase:upcoming?'ACTIVE':complete?'COMPLETE':'CHAMPIONS',endsAt:stamp(2400000)},membership:null,teams,rules:{maxMembers:22},
      champions:{enabled:true,seasonId:7,seasonNo:4,status:upcoming?'UPCOMING':complete?'COMPLETED':final?'FINAL':'SEMIFINAL',seeds:upcoming?[]:teams,matches:upcoming?[]:final?[semi,finalMatch]:[semi],winnerClanId:complete?6:0,
        semifinalStartsAt:semi.startsAt,finalStartsAt:final?finalMatch.startsAt:stamp(86400000),rewardStatus:'AWAITING_CONFIG',rewards:[]}};
  }
  function render(){document.querySelectorAll('[data-case]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.case===view)));ClanV1.stop();ClanV1.state.tab='champions';ClanV1.bind({apiRequest:async()=>fixture()});}
  document.querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>{view=b.dataset.case;render()});render();
})();
