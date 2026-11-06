import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomBytes} from 'node:crypto';

const op='draw:pepegu:roster32:100to1:20261106:v1';
const sourceUrl=new URL('../reversecall-streamer-box-100to5-20261105/source.json',import.meta.url);
const previousPlanUrl=new URL('../reversecall-streamer-box-100to5-20261105/plan.json',import.meta.url);
const previousCompletionUrl=new URL('../reversecall-streamer-box-100to5-20261105/completion.json',import.meta.url);
const sha=v=>createHash('sha256').update(v).digest('hex');
const readJson=async url=>JSON.parse(await fs.readFile(url,'utf8'));
const sourceBytes=await fs.readFile(sourceUrl),source=JSON.parse(sourceBytes),previousPlan=await readJson(previousPlanUrl),previousCompletion=await readJson(previousCompletionUrl);
assert.equal(sha(JSON.stringify(previousPlan)),previousCompletion.planHash);
assert.equal(source.operationKey,previousCompletion.operationKey);
assert.equal(sha(JSON.stringify(source)),previousPlan.sourceHash);
assert.equal(previousCompletion.status,'COMPLETED_AND_INDEPENDENTLY_VERIFIED');
const participants=source.recipients.map((entry,index)=>{
 const identified=previousPlan.recipients[index];assert.equal(entry.inputNickname,identified.inputNickname);assert.equal(entry.marker,identified.marker);
 assert(Number.isSafeInteger(entry.marker)&&entry.marker>=100);
 return {order:index+1,userId:identified.userId,nickname:entry.inputNickname,sourceQuantity:entry.marker,tickets:Math.floor(entry.marker/100)};
});
assert.equal(participants.length,32);assert.equal(new Set(participants.map(p=>p.userId)).size,32);assert.equal(new Set(participants.map(p=>p.nickname)).size,32);
assert.equal(participants.reduce((n,p)=>n+p.tickets,0),113);
const request={operationKey:op,dateKst:'2026-11-06',authorization:'100개당 추첨권 1개로 해서 페페구 10명 추첨해',prize:{code:'PET-PEPEGU',name:'페페구'},scope:'DRAW_ONLY',sourceOperationKey:source.operationKey,sourceSha256:sha(sourceBytes),previousPlanHash:previousCompletion.planHash,policy:{ticketFormula:'floor(sourceQuantity / 100)',ignoreRemainder:true,winnerCount:10,uniqueAccounts:true,removeAllWinnerTickets:true,algorithm:'HMAC-SHA256 counter stream; uint32 rejection sampling; sequential weighted sampling without replacement'},participantCount:32,totalTickets:113,participants};
const requestHash=sha(JSON.stringify(request)),seedUrl=new URL('./seed.json',import.meta.url),resultUrl=new URL('./result.json',import.meta.url);
let savedSeed;
try{savedSeed=await readJson(seedUrl);}catch(error){
 if(error.code!=='ENOENT')throw error;
 const fresh={operationKey:op,requestHash,createdAt:new Date().toISOString(),seedHex:randomBytes(32).toString('hex')};
 try{await fs.writeFile(seedUrl,JSON.stringify(fresh,null,2)+'\n',{flag:'wx'});savedSeed=fresh;}
 catch(writeError){if(writeError.code!=='EEXIST')throw writeError;savedSeed=await readJson(seedUrl);}
}
assert.equal(savedSeed.operationKey,op);assert.equal(savedSeed.requestHash,requestHash);assert.match(savedSeed.seedHex,/^[a-f0-9]{64}$/);
function draw(seedHex){
 const pool=structuredClone(participants),winners=[],trace=[];let counter=0;
 for(let rank=1;rank<=10;rank++){
  const total=pool.reduce((n,p)=>n+p.tickets,0),limit=Math.floor(4294967296/total)*total;
  let digest,value,usedCounter;
  do{usedCounter=counter++;digest=createHmac('sha256',Buffer.from(seedHex,'hex')).update(op+'|'+requestHash+'|'+usedCounter).digest();value=digest.readUInt32BE(0);}while(value>=limit);
  const ticketIndex=value%total;let offset=0,index=-1;
  for(let j=0;j<pool.length;j++){if(ticketIndex<offset+pool[j].tickets){index=j;break;}offset+=pool[j].tickets;}
  assert(index>=0);const winner=pool.splice(index,1)[0];
  winners.push({rank,...winner});trace.push({rank,poolTickets:total,ticketIndexZeroBased:ticketIndex,counter:usedCounter,randomUint32:value,digestHex:digest.toString('hex'),winnerUserId:winner.userId,winnerTicketRangeZeroBased:[offset,offset+winner.tickets-1]});
 }
 assert.equal(winners.length,10);assert.equal(new Set(winners.map(w=>w.userId)).size,10);
 return {winners,trace,remainingParticipants:pool.length,remainingTickets:pool.reduce((n,p)=>n+p.tickets,0)};
}
const selected=draw(savedSeed.seedHex);assert.deepEqual(draw(savedSeed.seedHex),selected);
let result,replayed=false;
try{result=await readJson(resultUrl);replayed=true;}catch(error){
 if(error.code!=='ENOENT')throw error;
 result={status:'DRAW_COMPLETED_NOT_GRANTED',...request,requestHash,seedCommitment:sha(Buffer.from(savedSeed.seedHex,'hex')),seedHex:savedSeed.seedHex,seedSavedAt:savedSeed.createdAt,completedAt:new Date().toISOString(),...selected,duplicateWinners:0,grantWrites:0,messagesSent:0,gameDeployment:false,storageMaintenance:false,scheduledAutomations:0};
 try{await fs.writeFile(resultUrl,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}catch(writeError){if(writeError.code!=='EEXIST')throw writeError;result=await readJson(resultUrl);replayed=true;}
}
assert.equal(result.requestHash,requestHash);assert.equal(result.seedHex,savedSeed.seedHex);assert.deepEqual(result.winners,selected.winners);assert.deepEqual(result.trace,selected.trace);assert.equal(result.grantWrites,0);
const kst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(result.completedAt))+' KST';
const readme=`# 페페구 10명 가중 추첨 — 2026-11-06

추첨 완료: ${kst}. 앞선 리버스콜 스트리머 박스 명단32명·원문수량을 그대로 사용했다. 100개당1장, 100개 미만 나머지 제외로 총113장이다. 509→5장(19명), 209→2장(2명), 109/100→1장(10명), 찬호400→4장(1명).

암호학적 난수 seed를 먼저 신규 파일로 고정한 후, HMAC-SHA256와 편향 방지 rejection sampling으로 매회 남은 추첨권 중1장을 선택했다. 당첨된 계정의 모든 추첨권을 풀에서 제외해 중복 없이10명을 뽑았다. 재실행은 저장된 seed·결과를 검증하고 같은 당첨자를 반환하며 재추첨하지 않는다.

| 추첨 순서 | 당첨 닉네임 | 계정 ID | 원문 수량 | 추첨권 |
| ---: | --- | ---: | ---: | ---: |
${result.winners.map(w=>`| ${w.rank} | ${w.nickname} | ${w.userId} | ${w.sourceQuantity} | ${w.tickets} |`).join('\n')}

이번 요청 범위는 추첨이며 페페구 지급은 실행하지 않았다. 운영DB 쓰기0·메시지0·게임배포0·예약0·유지관리0. 앞선32명565박스 지급은 보존했다. 지급 후속 요청이 오면 이 당첨자 명단을 사용하고 재추첨하지 않는다.

추첨키 ${op}. 요청해시 ${requestHash}. seed commitment ${result.seedCommitment}. 전체 참가자·추첨권·seed·매회 선택 추적은 result.json에 보존한다. 같은 seed로 재계산 일치·고유당첨10명·합계113장 확인.
`;
try{await fs.writeFile(new URL('./README.md',import.meta.url),readme,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(await fs.readFile(new URL('./README.md',import.meta.url),'utf8'),readme);}
console.log(JSON.stringify({status:result.status,replayed,operationKey:op,participantCount:32,totalTickets:113,completedAtKst:kst,winners:result.winners.map(({rank,nickname,tickets})=>({rank,nickname,tickets})),duplicateWinners:0,grantWrites:0,resultSha256:sha(await fs.readFile(resultUrl))},null,2));
