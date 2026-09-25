import {MERCENARY_RANKS} from '../shared/mercenary-ranks-v1.mjs';
import {withMercenaryDeadline} from '../shared/mercenary-loading-v1.mjs?v=20260925';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rate=value=>Number.isFinite(value)?value.toLocaleString('ko-KR',{maximumFractionDigits:8}):'확인 필요';

export async function readMercenaryFusionFeature(){
  const controller=new AbortController();
  try{return await withMercenaryDeadline(async()=>{
    const response=await fetch('/api/mercenaries/v3/fusion/feature',{signal:controller.signal,cache:'no-store'});
    const value=await response.json(),p=value?.policy;
    if(!response.ok||typeof value?.enabled!=='boolean'||!p||
      !Number.isSafeInteger(p.materialCount)||p.materialCount<1||
      !Number.isSafeInteger(p.chanceTotal)||p.chanceTotal<1||
      !Number.isSafeInteger(p.successChancePpm)||p.successChancePpm<0||p.successChancePpm>p.chanceTotal||
      !Number.isSafeInteger(p.coinCost)||p.coinCost<0||p.resultQuantity!==1||
      p.materialRule!=='SAME_RANK'||p.successOutcome!=='NEXT_RANK'||p.failureOutcome!=='SAME_RANK_RANDOM'||
      p.preserveOriginal!==true||p.withinRankSelection!=='EXISTING_CMS_CARD_WEIGHTS')
      throw Error('운영 합성 상태와 정책을 확인하지 못했습니다. 다시 확인해 주세요.');
    return value;
  },{timeoutMs:12000,message:'운영 합성 상태 조회가 지연됩니다. 다시 확인해 주세요.'});}
  finally{controller.abort();}
}

export function fusionCardRate(row,rank,policy){
  const parts=[`등급 내 ${rate(row.withinRankPercent)}%`],index=MERCENARY_RANKS.indexOf(rank);
  if(policy){
    const promoted=policy.successChancePpm/policy.chanceTotal;
    if(index>0)parts.push(`${MERCENARY_RANKS[index-1]} 합성 → ${rate(row.withinRankPercent*promoted)}%`);
    if(index<MERCENARY_RANKS.length-1)parts.push(`${rank} 합성 → ${rate(row.withinRankPercent*(1-promoted))}%`);
  }
  return parts.join(' · ');
}

export function fusionManagementHtml({feature,featureBusy,featureError,rankCards,weightEditor,dirty,drawChanges}){
  const policy=feature?.policy,success=policy?policy.successChancePpm/policy.chanceTotal*100:null;
  const status=featureBusy?'확인 중':featureError?'확인 실패':feature?.enabled?'ON':feature?'OFF':'확인 대기';
  return `<header class="mf-heading"><div><small>MERCENARY / FUSION CONTROL</small><h3>용병 합성 관리</h3><p>확정 합성 규칙과 결과 용병의 추첨 비율을 관리합니다.</p></div><div class="mf-state"><span>실제 카드 소모·지급</span><strong data-fusion-status>${status}</strong><button type="button" data-fusion-reload ${featureBusy?'disabled':''}>상태 다시 확인</button></div></header>
    <div class="mf-release"><p role="status">${featureError?'운영 상태를 확인하지 못했습니다. 상태 다시 확인을 눌러 주세요.':feature?.enabled?'실제 합성이 활성화되어 있습니다.':feature?'합성 공개 준비 중입니다. 실제 카드 소모·지급 활성화는 별도 출시 승인이 필요합니다.':'운영 서버에서 합성 상태를 확인하고 있습니다.'}</p><a href="/mercenary-codex/?fusion=preview" target="_blank" rel="noopener">합성 연출 시연 ↗</a></div>
    ${policy?`<section class="mf-rules" aria-label="확정 합성 정책"><div><span>같은 등급 중복 재료</span><strong>${policy.materialCount}<small>장</small></strong></div><div><span>한 단계 승급</span><strong>${rate(success)}<small>%</small></strong></div><div><span>동일 등급 지급</span><strong>${rate(100-success)}<small>%</small></strong></div><div><span>추가 코인</span><strong>${rate(policy.coinCost)}<small>개</small></strong></div><p>서로 다른 용병을 섞을 수 있으며, 용병마다 기본 보유 1장은 보존합니다. 결과는 항상 1장입니다. SSS는 재료로 사용할 수 없습니다.</p></section>
    <section class="mf-transitions" aria-label="재료 등급별 결과"><div class="mf-transition mf-transition-head"><span>재료</span><span>승급 ${rate(success)}%</span><span>동일 등급 ${rate(100-success)}%</span><span>후보 구성</span></div>${MERCENARY_RANKS.slice(0,-1).map((rank,i)=>{const next=MERCENARY_RANKS[i+1],ready=rankCards[rank].length&&rankCards[next].length;return `<div class="mf-transition"><b class="md-grade" data-rank="${rank}">${rank} × ${policy.materialCount}</b><span>${next} <small>${rankCards[next].length}종</small></span><span>${rank} <small>${rankCards[rank].length}종</small></span><em class="${ready?'':'is-empty'}">${ready?'구성됨':'등급 설정 필요'}</em></div>`;}).join('')}</section>`:''}
    <div class="mf-weights-heading"><div><h4>결과 용병 가중치</h4><p>저장된 용병 등급을 기준으로 계산합니다. 가중치를 바꾸면 같은 등급 안의 선택 비율이 달라집니다.</p></div><span data-fusion-draft>${dirty?'미저장 변경 포함':'저장된 가중치'}</span></div>
    <p class="mf-shared-note">이 가중치는 <b>하이퍼팩과 합성이 함께 사용</b>합니다. 저장하면 실제 하이퍼팩의 용병별 선택 비율에도 바로 적용됩니다. 합성 승급 확률 ${policy?rate(success)+'%':'확인 중'}와 하이퍼팩의 등급 당첨 확률은 별개입니다.</p>
    ${drawChanges?'<p class="mf-draft-warning">개봉 확률 탭에 저장하지 않은 확률·수량 또는 메모가 있습니다. <button type="button" data-tab="draw">개봉 확률에서 먼저 저장</button>하거나 다시 불러오세요.</p>':''}
    <p class="mf-rate-note">아래 합성 확률은 각 재료 등급으로 1회 시도했을 때 해당 용병을 얻을 확률입니다. 실제 합성이 OFF여도 정책에 따른 계산값을 확인할 수 있습니다.</p>
    <div class="mf-weights">${MERCENARY_RANKS.map(rank=>`<section class="mf-rank"><div><b class="md-grade" data-rank="${rank}">${rank}</b><span>${rankCards[rank].length}종${rank==='SSS'?' · 승급 결과 전용':''}</span></div>${rankCards[rank].length?weightEditor(rank):'<p class="mf-empty">저장된 용병이 없습니다. 용병 도감 탭에서 등급을 설정하세요.</p>'}</section>`).join('')}</div>`;
}
