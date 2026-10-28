import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {WAR_CHAT_KINDS} from '../shared/war-chat-v1.mjs?v=20261028-chat2';
import {chatStyle} from '../js/war-chat-v1.mjs?v=20261028-chat2';
export async function mountWarChatCms(root){
 chatStyle();root.classList.add('cn-command-ui');let settings=null,busy=false;
 root.innerHTML='<header class="cn-ui-panel"><small>OWNER 전용 운영 설정</small><h2>채팅창</h2><p>클랜전 · 영토전 · 세력전에서 같은 편끼리 대화합니다.<br>세 채팅방은 OFF로 시작하며, 아래 버튼으로 각각 켜고 끌 수 있습니다.</p></header><p data-chat-admin-status role="status"></p><div class="chat-cms-grid"></div><p class="chat-cms-note">설정은 저장 즉시 적용되며, 기존 연결도 5초 간격으로 운영 상태를 확인합니다.<br>최근 메시지 100개 · 최대 24시간 · 메시지당 300자 · 전송 간격 1.5초</p><button type="button" class="cn-ui-button" data-chat-admin-reload>새로 불러오기</button>';
 const note=text=>root.querySelector('[data-chat-admin-status]').textContent=text;
 const lock=value=>{busy=value;root.querySelectorAll('button').forEach(b=>b.disabled=value);};
 function draw(){root.querySelector('.chat-cms-grid').innerHTML=Object.entries(WAR_CHAT_KINDS).map(([kind,name])=>`<article class="cn-ui-panel"><h3>${name}</h3><p>${{clan:'현재 시즌의 같은 클랜',territory:'현재 회차의 같은 A·B팀',faction:'현재 편성의 같은 세력'}[kind]}만 입장합니다.</p><button type="button" class="cn-ui-button ${settings[kind]?'primary':''}" role="switch" aria-label="${name} 채팅" aria-checked="${settings[kind]}" data-chat-toggle="${kind}">${settings[kind]?'ON · 사용 중':'OFF · 사용 중지'}</button></article>`).join('');}
 async function load(){if(busy)return;lock(true);note('저장된 채팅 설정을 불러오는 중…');try{settings=(await api('admin/war-chat')).settings;draw();note('저장된 설정 · r'+settings.revision);}catch(e){note(e.message);}finally{lock(false);}}
 root.addEventListener('click',async e=>{
  const kind=e.target.closest('[data-chat-toggle]')?.dataset.chatToggle;if(!kind||busy||!settings)return;
  const body={kind,enabled:!settings[kind],revision:settings.revision};lock(true);note('저장 중…');
  try{settings=(await api('admin/war-chat',{method:'POST',body})).settings;draw();note(WAR_CHAT_KINDS[kind]+' 채팅 '+(settings[kind]?'ON':'OFF')+' 저장 완료 · r'+settings.revision);}
  catch(error){note(error.message+' 새로 불러오기 후 확인하세요.');settings=null;}
  finally{lock(false);if(!settings)root.querySelectorAll('[data-chat-toggle]').forEach(b=>b.disabled=true);}
 });
 root.querySelector('[data-chat-admin-reload]').onclick=load;await load();
}
function install(){
 const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role||document.getElementById('view-war-chat'))return;
 const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='채팅창';button.dataset.view='war-chat';button.hidden=true;panel.id='view-war-chat';panel.className='view war-chat-cms';panel.hidden=true;nav.append(button);cms.append(panel);
 let mounted=false;
 button.addEventListener('click',e=>{e.stopImmediatePropagation();if(role.textContent.trim()!=='OWNER')return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='채팅창';if(!mounted){mounted=true;void mountWarChatCms(panel);}if(innerWidth<=800)window.scrollTo(0,0);});
 const sync=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();mounted=false;}};window.addEventListener('soop:cms-identity',sync);new MutationObserver(sync).observe(role,{childList:true,characterData:true,subtree:true});sync();
}
install();
