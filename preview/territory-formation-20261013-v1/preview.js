// Presentation-only fixture. This page never calls a game API.
(() => {
 const deadline=new Date(Date.now()+7200000).toISOString();
 const state={mode:'ON',round:{id:70,status:'RECRUITING',warfare_version:6,battle_name:'삼면 전선',recruitment_ends_at:deadline},allocation:'INDIVIDUAL',network:{},settings:{teamAName:'수호',teamBName:'정화',energyMax:15,minParticipants:6},counts:{total:146,A:0,B:0},registration:{canRegister:true,canCancel:false},mine:null};
 const root=document.querySelector('#previewRoot');
 function toast(message){document.querySelector('.preview-toast')?.remove();const node=document.createElement('div');node.className='preview-toast';node.setAttribute('role','status');node.textContent=message;document.body.append(node);setTimeout(()=>node.remove(),2600)}
 function tick(){const node=root.querySelector('[data-tw3-countdown]');if(!node)return;const seconds=Math.max(0,Math.ceil((Date.parse(deadline)-Date.now())/1000));node.textContent=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':')}
 function render(){root.innerHTML=CNineTerritoryFormation.lobby(state,{canRefresh:Boolean(state.mine)});tick()}
 root.addEventListener('click',event=>{
  if(event.target.closest('[data-tw3-register]')){state.mine={deck_power:987650,deck_snapshot:'[1,2,3,4,5]',formation_breakdown_json:'{"deckComplete":true}'};state.registration={canRegister:false,canCancel:true};render();toast('미리보기: 참가 신청 완료 상태입니다.')}
  else if(event.target.closest('[data-tw3-unregister]')){state.mine=null;state.registration={canRegister:true,canCancel:false};render()}
  else if(event.target.closest('[data-tw3-loadout-refresh]'))toast('미리보기: 등록 전투력을 최신화했습니다.');
  else if(event.target.closest('[data-tw3-refresh]'))render();
  else if(event.target.closest('[data-tw3-close]')){root.hidden=true;document.querySelector('#previewNotice').innerHTML='미리보기를 닫았습니다. <a style="color:#c8ff6b" href="./">다시 보기</a>'}
 });
 render();setInterval(tick,1000);
})();
