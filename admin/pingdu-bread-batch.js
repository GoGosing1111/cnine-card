import {byId as $, count, element, initDate, today} from '/events/pingdu-bread/client.js';

export function bindBatch(api, onPaid) {
  const date=$('batchDay'), posts=$('batchPosts'), minutes=$('batchMinutes'), cap=$('batchCap');
  const dialog=$('batchConfirmation'), start=$('batchStart'), pay=$('batchPay'), note=$('batchStatus');
  initDate(date);
  date.value=new Date(Date.parse(today()+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  let batch=null, version=0, busy=false, loaded=false, paying=false;
  const rules=()=>({postsPerBread:Number(posts.value),minutesPerBread:Number(minutes.value),dailyCap:Number(cap.value)});
  function setRules(value) {
    posts.value=value.postsPerBread; minutes.value=value.minutesPerBread; cap.value=value.dailyCap;
  }
  function render() {
    $('batchToday').hidden=date.value!==today();
    for (const input of [posts,minutes,cap]) input.disabled=busy || !loaded;
    date.disabled=paying;
    start.disabled=busy || !loaded;
    $('batchResult').hidden=!batch;
    pay.hidden=true;
    if (!batch) return;
    const c=batch.counts, finished=batch.total-c.pending-c.checking;
    const dirty=Object.entries(rules()).some(([key,value])=>value!==batch.rules[key]);
    const progress=$('batchProgress');
    progress.max=batch.total || 1; progress.value=finished;
    progress.hidden=finished===batch.total;
    $('batchTotals').replaceChildren(element('strong',batch.paidAt
      ? '지급 완료 '+count(c.paid)+'명 · '+count(batch.paidAmount)+'마리'
      : '지급 예정 '+count(c.ready)+'명 · '+count(batch.amount)+'마리'));
    $('batchBreakdown').textContent='집계 '+count(finished)+' / '+count(batch.total)+'명 · 이미 지급 '+count(c.previous)+'명 · 기준 미달 '+count(c.zero)+'명 · 보류 '+count(c.held)+'명';
    $('batchPostCounts').textContent='이번 집계 신규 글 '+count(batch.newPosts)+'건 · 앞서 집계한 미지급 글 '+count(batch.carryPosts)+'건';
    $('batchHeld').hidden=!c.held;
    const held=batch.held.map(row=>element('li',(row.nickname || '계정')+' (#'+row.userId+') · '+row.reason));
    if (c.held>held.length) held.push(element('li','외 '+count(c.held-held.length)+'명'));
    $('batchHeldList').replaceChildren(...held);
    pay.hidden=!loaded || busy || dirty || Boolean(batch.paidAt) || finished!==batch.total || !c.ready;
    start.textContent='전체 다시 집계';
    if (busy) return;
    if (dirty) note.textContent='변경한 기준으로 다시 집계하세요.';
    else if (batch.paidAt) note.textContent=batch.day+' 지급을 완료했습니다. 같은 날 다시 집계하면 추가로 지급할 공개 글을 확인할 수 있습니다.';
    else if (c.held) note.textContent='보류 계정은 지급 대상에서 제외했습니다. 다시 집계하면 활동을 재조회합니다.';
    else if (finished===batch.total) note.textContent=c.ready?'집계가 끝났습니다. 지급 내역을 확인하세요.':'이 날짜에 새로 지급할 계정이 없습니다.';
  }
  function errorState(message) {
    busy=false; loaded=false; render();
    note.textContent=message; $('batchResume').hidden=false;
  }
  async function collect(token) {
    while (token===version && batch && (batch.counts.pending || batch.counts.checking)) {
      note.textContent='전체 계정의 활동을 집계하고 있습니다…';
      if (!batch.counts.pending && batch.counts.checking) await new Promise(resolve=>setTimeout(resolve,1200));
      if (token!==version) return;
      const next=await api('batch-step',{body:{day:batch.day,id:batch.id}});
      if (token!==version) return;
      batch=next; render();
    }
    if (token===version) { busy=false; render(); }
  }
  async function load() {
    const token=++version;
    busy=true; loaded=false; batch=null; $('batchResume').hidden=true;
    start.textContent='전체 활동 집계'; note.textContent='정산 기록을 확인하고 있습니다…'; render();
    try {
      const result=await api('batch',{query:{day:date.value}});
      if (version!==token) return;
      batch=result.batch; setRules(batch?.rules ?? result.defaults); loaded=true;
      note.textContent=batch?'':'집계에 사용한 기준은 다음 정산에도 적용됩니다.';
      render(); await collect(token);
    } catch (error) { if (version===token) errorState(error.message); }
  }
  date.onchange=()=>{ if (date.validity.valid) void load(); };
  for (const field of [posts,minutes,cap]) field.oninput=render;
  $('batchResume').onclick=load;
  $('batchForm').onsubmit=async event=>{
    event.preventDefault();
    if (busy || !loaded) return;
    const token=++version;
    const body={day:date.value,id:crypto.randomUUID(),previousId:batch?.id ?? null,rules:rules()};
    busy=true; $('batchResume').hidden=true; note.textContent='정산 대상을 모으고 있습니다…'; render();
    try {
      const next=await api('batch-start',{body});
      if (version!==token) return;
      batch=next; render(); await collect(token);
    } catch (error) { if (version===token) errorState(error.message); }
  };
  pay.onclick=()=>{
    if (pay.hidden || !batch) return;
    $('batchConfirmText').textContent=batch.day+' 활동으로 '+count(batch.counts.ready)+'명에게 붕어빵 총 '+count(batch.amount)+'마리를 지급합니다. 확정 후 각 계정의 봉투에 바로 담깁니다.';
    dialog.showModal(); $('batchCancel').focus();
  };
  $('batchCancel').onclick=()=>{ if (!paying) dialog.close(); };
  dialog.addEventListener('cancel',event=>{ if (paying) event.preventDefault(); });
  $('batchConfirm').onclick=async()=>{
    if (!batch || busy || paying) return;
    const body={day:batch.day,id:batch.id,accounts:batch.counts.ready,amount:batch.amount};
    busy=paying=true; $('batchConfirm').disabled=true; render();
    $('batchConfirmText').textContent='글 공개 상태를 다시 확인하고 있습니다. 확인이 끝나면 지급 결과를 표시합니다.';
    try {
      batch=await api('batch-pay',{body});
      busy=paying=false; render(); await onPaid();
    } catch (error) { paying=false; errorState(error.message+' 저장된 지급 결과를 다시 확인하세요.'); }
    finally { $('batchConfirm').disabled=false; dialog.close(); }
  };
  return load;
}
