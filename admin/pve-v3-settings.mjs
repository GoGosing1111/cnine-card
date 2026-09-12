import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
const names={mode:'입장 모드',rulesVersion:'전투 규칙 버전',version:'경제 정책 버전',maxTier:'준비 최고층',normalCount:'일반 수',eliteCount:'정예 수',simultaneous:'동시 등장',normalPoints:'일반 점수',elitePoints:'정예 점수',basePower:'기본 전투력',powerGrowth:'층당 전투력 배율',hpGrowth:'HP 배율',attackGrowth:'공격 배율',eliteMultiplier:'정예 배율',guardianMultiplier:'수호자 배율',maxActions:'행동 한도',forcedMonsterEvery:'적 행동 간격',combatLimitMs:'전투 제한 (ms)',autoRepeatMax:'자동 반복 한도',fastUnlockTwo:'2층 해금 비율',fastUnlockThree:'3층 해금 비율',entryCoin:'입장 코인',dailyRewardedClears:'일일 보상 성공 횟수',repeatCoinPercent:'반복 코인 비율 (%)',repeatCoinCap:'반복 코인 상한',materialCode:'부가 재료 코드',materialName:'부가 재료 이름',materialMinTier:'재료 시작층',materialEvery:'재료 지급 간격',materialQuantity:'재료 수량',materialDailyCap:'재료 일일 한도',dailyRuns:'일일 입장 횟수',dailyCoinCap:'일일 코인 상한'};
export async function mountPveV3Cms(host){
  let data,busy=false,dirty=false;
  host.classList.add('pve-v3-cms');host.replaceChildren();
  const title=document.createElement('h2');title.textContent='V3 공동 출시 · 원정 설정';
  const note=document.createElement('p');note.textContent='탑과 카우방의 전투·경제 초안을 저장합니다. 자동 원정은 기존 서버 자동 진행과 CMS 설정을 유지합니다. 공동 출시 실행은 OFF입니다.';
  const status=document.createElement('p');status.setAttribute('role','status');
  const tabs=document.createElement('div'),form=document.createElement('form'),buttons=document.createElement('div'),reload=document.createElement('button'),save=document.createElement('button');reload.type='button';reload.textContent='다시 불러오기';save.type='submit';save.textContent='초안 저장';buttons.append(reload,save);let selected='TOWER';
  host.append(title,note,tabs,form,status);let original;
  function draw(){form.replaceChildren();if(!data)return;original=selected==='TOWER'?data.tower:data.cow;const version=document.createElement('p');version.textContent=`저장 버전 r${original.revision} · 미승인 초안 · 공동 실행 ${data.release.enabled?'ON':'OFF'}`;form.append(version);
    if(selected==='COW_ROOM'){const portal=document.createElement('p');portal.className='pve-v3-portal-policy';portal.textContent=`포탈 입장 · 일반 PVE ${data.cowPortal.standardPercent}% / 아포칼립스 ${data.cowPortal.apocalypsePercent}% · 토벌·소탕 완료 전투마다 1회 판정 · 포탈 1개당 1회 입장`;form.append(portal);}
    const sections=selected==='TOWER'?{config:original.config,economy:original.economy}:{economy:original};
    for(const [section,values] of Object.entries(sections)){const fieldset=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=section==='config'?'전투 규칙':'입장과 보상';fieldset.append(legend);
      for(const [key,value] of Object.entries(values)){if(!Object.hasOwn(names,key))continue;const label=document.createElement('label'),name=document.createElement('span');name.textContent=names[key];let input;
        if(key==='mode'){input=document.createElement('select');for(const mode of ['OFF','TEST']){const option=document.createElement('option');option.value=mode;option.textContent=mode==='OFF'?'OFF · 입장 중지':'TEST · OWNER 검수';input.append(option);}}
        else{input=document.createElement('input');input.type=typeof value==='number'?'number':'text';if(input.type==='number'){input.min='0';input.step='any';}else input.maxLength=100;}
        input.name=section+'.'+key;input.value=String(value);if(selected==='TOWER'&&key==='entryCoin'){input.readOnly=true;input.max='0';name.textContent='입장 코인 · 무료 고정';}label.append(name,input);fieldset.append(label);
      }
      if(selected==='COW_ROOM'){const label=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input');name.textContent='카우 킹 돌파 코인';input.type='number';input.min='0';input.max='20000000';input.name='economy.clearCoin.0';input.value=String(values.clearCoin[0]);label.append(name,input);fieldset.append(label);}
      form.append(fieldset);
    }form.append(buttons);save.disabled=busy;
  }
  async function load(){if(busy)return;busy=true;status.textContent='현재 설정을 불러오는 중입니다.';try{data=await api('admin/pve-v3');dirty=false;status.textContent='설정을 불러왔습니다.';}catch(e){status.textContent=e.message;}finally{busy=false;draw();}}
  for(const [code,label] of [['TOWER','무한의탑'],['COW_ROOM','카우방']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{if(dirty){status.textContent='편집한 초안을 먼저 저장하거나 다시 불러오세요.';return;}selected=code;draw();};tabs.append(button);}
  reload.onclick=()=>{dirty=false;void load();};form.oninput=()=>dirty=true;
  form.onsubmit=async event=>{event.preventDefault();if(busy||!data)return;const next=structuredClone(original),sections=selected==='TOWER'?next:{economy:next};for(const [key,value] of new FormData(form)){const [group,name,index]=key.split('.');if(index!==undefined)sections[group][name][Number(index)]=Number(value);else sections[group][name]=typeof sections[group][name]==='number'?Number(value):String(value);}
    busy=true;save.disabled=true;try{await api('admin/pve-v3',{method:'PATCH',body:{content:selected,revision:original.revision,...(selected==='TOWER'?{config:next.config,economy:next.economy}:{economy:next})}});dirty=false;status.textContent='초안을 저장했습니다. 공동 실행은 OFF입니다.';data=await api('admin/pve-v3');draw();}catch(e){status.textContent=e.message;}finally{busy=false;save.disabled=false;}};
  await load();
}
function install(){const nav=document.getElementById('nav'),cms=document.getElementById('cms'),role=document.getElementById('roleBadge');if(!nav||!cms||!role)return;const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='V3 원정';button.dataset.view='pve-v3';button.hidden=true;panel.id='view-pve-v3';panel.className='view';panel.hidden=true;nav.append(button);cms.append(panel);let mounted=false;
  button.addEventListener('click',e=>{e.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='V3 원정';history.replaceState(null,'','#pve-v3');if(!mounted){mounted=true;void mountPveV3Cms(panel);}},true);
  const access=()=>{button.hidden=role.textContent.trim()!=='OWNER';if(button.hidden){panel.hidden=true;panel.replaceChildren();mounted=false;}};new MutationObserver(access).observe(role,{childList:true,subtree:true,characterData:true});access();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
