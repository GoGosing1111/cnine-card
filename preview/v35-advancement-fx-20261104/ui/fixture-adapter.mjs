import {POLICY,quote,amount} from './model.mjs';
const source='assets/ui/project-v/mercenaries/';
export function initialSnapshot(){return {revision:0,policyRevision:POLICY.revision,wallet:{coin:'35000000000000',MASTER_STAR:'120000000'},cards:[
 {code:'V-996',name:'발테르',rank:'SSS',edition:'LIMITED',sourceArt:source+'limited-20261002/v-996-source-art.png',totalCopies:1,growth:{level:21,breakthroughMask:15},equipment:['fixture-blade'],advancement:{id:null,revision:0}},
 {code:'V-004',name:'베스페라',rank:'SS',sourceArt:source+'female-office-sniper-red-v1.png',totalCopies:2,growth:{level:16,breakthroughMask:7},equipment:[],advancement:{id:'healer',revision:0}},
 {code:'V-049',name:'크라이베른',rank:'SSS',sourceArt:source+'cryvern-source-art-v1.png',totalCopies:1,growth:{level:15,breakthroughMask:3},equipment:[],advancement:{id:null,revision:0}},
 {code:'V-013',name:'라비에나',rank:'S',sourceArt:source+'short-bob-k2-amethyst-officer-mercenary-source-art-v1.png',totalCopies:1,growth:{level:21,breakthroughMask:15},equipment:[],advancement:{id:null,revision:0}}
 ]};}
/** Explicit in-memory preview adapter; no fetch, storage, account tokens or API.
 * This exercises the UI protocol, NOT a production economic transaction. */
export function createFixtureAdapter(seed=initialSnapshot()){
 let snapshot=structuredClone(seed),fault=null,commits=0;const receipts=new Map(),pending=new Map();
 const read=async()=>structuredClone(snapshot);
 const commit=request=>{
  const fingerprint=JSON.stringify([request.mercenaryCode,request.advancementId,request.expectedRevision,request.expectedPolicyRevision]);
  const known=receipts.get(request.idempotencyKey)||pending.get(request.idempotencyKey);
  if(known){if(known.fingerprint!==fingerprint)return Promise.reject(Object.assign(Error('요청 정보가 일치하지 않습니다.'),{code:'KEY_MISMATCH'}));return known.promise||Promise.resolve(structuredClone(known.result));}
  const promise=(async()=>{
   await new Promise(r=>setTimeout(r,180));
   if(fault==='reject'){fault=null;throw Object.assign(Error('처리를 완료하지 못했습니다. 재화를 소모하지 않았습니다.'),{code:'REJECTED',definitive:true});}
   const q=quote(snapshot,request.mercenaryCode,request.advancementId);
   if(request.expectedRevision!==snapshot.revision||request.expectedPolicyRevision!==snapshot.policyRevision)throw Object.assign(Error('보유 정보가 변경됐습니다. 다시 확인해 주세요.'),{code:'STALE',definitive:true});
   if(!q.canSubmit)throw Object.assign(Error(q.unavailable||'재화가 부족합니다.'),{code:'INELIGIBLE',definitive:true});
   const next=structuredClone(snapshot),card=next.cards.find(c=>c.code===request.mercenaryCode);
   for(const key of Object.keys(POLICY.cost))next.wallet[key]=String(amount(next.wallet[key])-amount(POLICY.cost[key]));
   card.advancement={id:request.advancementId,revision:(card.advancement.revision||0)+1};next.revision++;
   snapshot=next;commits++;
   const result={receiptId:'local-preview:'+commits,requestId:request.idempotencyKey,snapshot:structuredClone(snapshot)};
   receipts.set(request.idempotencyKey,{fingerprint,result});
   if(fault==='lost-response'){fault=null;throw Object.assign(Error('결과를 아직 확인하지 못했습니다. 같은 요청의 결과를 다시 확인하세요.'),{code:'UNKNOWN',ambiguous:true});}
   return structuredClone(result);
  })().finally(()=>pending.delete(request.idempotencyKey));
  pending.set(request.idempotencyKey,{fingerprint,promise});return promise;
 };
 return {read,commit,setFault(value){fault=value;},setWallet(value){snapshot.wallet={...snapshot.wallet,...value};snapshot.revision++;},reset(seed=initialSnapshot()){snapshot=structuredClone(seed);receipts.clear();pending.clear();fault=null;commits=0;},audit(){return {kind:'LOCAL_MEMORY_ONLY',commits,receipts:receipts.size,pending:pending.size,snapshot:structuredClone(snapshot)};}};
}
