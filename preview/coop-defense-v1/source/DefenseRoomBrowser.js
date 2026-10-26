import {DEFENSE_DIFFICULTIES} from '../../../shared/monster-defense-v1.mjs';
import {DEFENSE_LIST_REFRESH_MS} from '../../../shared/monster-defense-room-list-v1.mjs';

export class DefenseRoomBrowser{
 constructor({request,canEnter,entryBlocked=()=>false,onJoin,onCreate,onFormation}){
  Object.assign(this,{request,canEnter,entryBlocked,onJoin,onCreate,onFormation});this.rows=[];this.serial=0;
  const dialog=document.createElement('dialog');dialog.className='defense-room-browser';dialog.setAttribute('aria-labelledby','defense-rooms-title');
  dialog.innerHTML=`<header class="rooms-heading"><div><p>CO-OP DEFENSE</p><h2 id="defense-rooms-title">방어대 모집</h2><span>함께 수호석을 지킬 대기방을 선택하세요.</span></div><button type="button" data-rooms-close>닫기</button></header>
   <div class="rooms-tools"><label><span class="sr-only">방 난이도</span><select data-rooms-difficulty><option value="">모든 난이도</option></select></label><button type="button" data-rooms-available aria-pressed="false">참가 가능한 방만</button><button type="button" data-rooms-refresh>새로고침</button></div>
   <div class="rooms-summary"><span data-rooms-count role="status">대기방을 찾고 있습니다.</span><span>10초마다 갱신</span></div>
   <div class="rooms-content"><p class="rooms-message" data-rooms-message role="status" hidden></p><div class="rooms-list" data-rooms-list></div></div>
   <footer class="rooms-footer"><p data-rooms-hint></p><div><button type="button" data-rooms-formation>내 분대 편성</button><button type="button" class="rooms-create" data-rooms-create>방 만들기 <span aria-hidden="true">›</span></button></div></footer>`;
  document.getElementById('defense-app').append(dialog);this.dialog=dialog;
  this.q=selector=>dialog.querySelector(selector);
  for(const difficulty of DEFENSE_DIFFICULTIES){const option=document.createElement('option');option.value=difficulty.id;option.textContent=difficulty.name;this.q('[data-rooms-difficulty]').append(option);}
  this.q('[data-rooms-close]').onclick=()=>this.close();
  this.q('[data-rooms-refresh]').onclick=()=>void this.refresh();
  this.q('[data-rooms-difficulty]').onchange=()=>void this.refresh();
  this.q('[data-rooms-available]').onclick=()=>{const b=this.q('[data-rooms-available]');b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true'));this.render();};
  this.q('[data-rooms-create]').onclick=()=>{this.close();this.onCreate();};
  this.q('[data-rooms-formation]').onclick=()=>{this.close();this.onFormation();};
  dialog.addEventListener('cancel',event=>{if(this.joining)event.preventDefault();});
  dialog.addEventListener('close',()=>{this.serial++;clearTimeout(this.timer);this.controller?.abort();if(this.opener?.isConnected&&this.opener.getClientRects().length)this.opener.focus();});
  document.addEventListener('visibilitychange',()=>{clearTimeout(this.timer);if(dialog.open&&!document.hidden)void this.refresh();});
 }
 open(){if(this.dialog.open)return;this.opener=document.activeElement;this.dialog.showModal();this.rows=[];this.render();void this.refresh();}
 close(){if(!this.joining)this.dialog.close();}
 async refresh(){
  clearTimeout(this.timer);if(!this.dialog.open||document.hidden||this.joining)return;
  this.controller?.abort();const controller=new AbortController(),serial=++this.serial;this.controller=controller;
  const timeout=setTimeout(()=>controller.abort(),8000);this.q('[data-rooms-refresh]').disabled=true;
  try{
   const data=await this.request('rooms?difficulty='+encodeURIComponent(this.q('[data-rooms-difficulty]').value),{signal:controller.signal});
   if(serial!==this.serial||!this.dialog.open)return;
   this.rows=data.rooms;this.more=data.hasMore;this.q('[data-rooms-message]').hidden=true;this.render();
  }catch(error){if(serial!==this.serial||!this.dialog.open)return;this.q('[data-rooms-message]').textContent=error.name==='AbortError'?'방 목록을 불러오지 못했습니다. 새로고침해 주세요.':error.message;this.q('[data-rooms-message]').hidden=false;}
  finally{clearTimeout(timeout);if(serial===this.serial&&this.dialog.open){this.q('[data-rooms-refresh]').disabled=false;this.timer=setTimeout(()=>void this.refresh(),DEFENSE_LIST_REFRESH_MS);}}
 }
 render(){
  const rows=this.rows.filter(room=>this.q('[data-rooms-available]').getAttribute('aria-pressed')!=='true'||room.joinable),canEnter=this.canEnter();
  this.q('[data-rooms-count]').textContent=`${rows.length}개 대기방${this.more?' · 최신 50개 표시':''}`;
  this.q('[data-rooms-hint]').textContent=canEnter?'선택한 용병 2명과 카드 1장으로 참가합니다.':'참가하기를 누르면 용병 2명과 카드 1장을 편성한 뒤 해당 방에 참가합니다.';
  if(this.entryBlocked())this.q('[data-rooms-hint]').textContent='오늘 참여 횟수가 0회입니다. 한국시간 00:00에 초기화됩니다.';
  this.q('[data-rooms-create]').disabled=!canEnter||this.joining;
  const list=this.q('[data-rooms-list]'),signature=JSON.stringify([rows,canEnter,!!this.joining,this.entryBlocked()]);if(list.dataset.signature===signature)return;list.dataset.signature=signature;
  const focused=document.activeElement?.dataset.roomJoin;list.replaceChildren();
  if(!rows.length){const empty=document.createElement('div');empty.className='rooms-empty';const art=document.createElement('img');art.src='/preview/coop-defense-v1/assets/ui-v5/guardian-crest.png';art.alt='';const title=document.createElement('h3');title.textContent='아직 모집 중인 방이 없습니다';const text=document.createElement('p');text.textContent='새 방을 만들어 방어대를 모아보세요. 다른 난이도의 방도 확인할 수 있습니다.';empty.append(art,title,text);list.append(empty);return;}
  for(const room of rows){
   const row=document.createElement('article');row.className='rooms-entry';row.dataset.roomId=room.id;
   const count=document.createElement('div');count.className='rooms-capacity';const number=document.createElement('strong');number.textContent=room.members+' / '+room.maxMembers;const label=document.createElement('span');label.textContent='대원';count.append(number,label);
   const info=document.createElement('div');info.className='rooms-info';const title=document.createElement('h3');title.textContent=room.hostName+'의 방어대';const meta=document.createElement('p');meta.textContent=room.difficultyName+' · '+room.totalWaves+' 웨이브';const status=document.createElement('span');status.textContent='준비 '+room.ready+' / '+room.members+'명 · '+(room.joinable?'대원 모집 중':'인원 마감');info.append(title,meta,status);
   const join=document.createElement('button');join.type='button';join.className='rooms-join';join.dataset.roomJoin=room.id;join.textContent=room.joinable?'참가하기':'인원 마감';join.setAttribute('aria-label',room.hostName+'의 방어대 '+(room.joinable?'참가':'인원 마감'));join.disabled=this.joining||!room.joinable;
   join.disabled||=this.entryBlocked();
   join.onclick=async()=>{
    if(this.joining)return;this.joining=true;clearTimeout(this.timer);this.controller?.abort();this.serial++;this.render();
    this.q('[data-rooms-close]').disabled=true;this.q('[data-rooms-formation]').disabled=true;let errorMessage='';
    try{
     if(!this.canEnter()){
      if(!await this.onFormation())return;
      if(!this.canEnter())throw new Error('출전 가능한 용병 2명과 카드 1장을 다시 선택해 주세요.');
     }
     const result=await this.onJoin(room.id);this.joining=false;if(result===true){this.dialog.close();document.getElementById('ready')?.focus();}else errorMessage=result?.error||'대기방에 참가하지 못했습니다. 갱신된 목록에서 다시 선택하세요.';
    }
    catch(error){errorMessage=error.message;}
    finally{this.joining=false;this.q('[data-rooms-close]').disabled=false;this.q('[data-rooms-formation]').disabled=false;if(this.dialog.open){await this.refresh();if(errorMessage){this.q('[data-rooms-message]').textContent=errorMessage;this.q('[data-rooms-message]').hidden=false;this.q('.rooms-content').scrollTop=0;}[...this.dialog.querySelectorAll('[data-room-join]')].find(button=>button.dataset.roomJoin===room.id)?.focus({preventScroll:true});}}
   };
   row.append(count,info,join);list.append(row);
  }
  if(focused)[...list.querySelectorAll('[data-room-join]')].find(button=>button.dataset.roomJoin===focused)?.focus({preventScroll:true});
 }
}
