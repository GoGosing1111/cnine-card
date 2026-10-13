import test from 'node:test';
import assert from 'node:assert/strict';
import {createRerollClient,rerollPendingKey,validateRerollReceipt} from '../mercenary-codex/sss-reroll/client.mjs';
const memory=()=>{const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
const receipt=requestId=>({requestId,status:'COMPLETED',accountId:7,itemCode:'MERCENARY_SSS_REROLL_TICKET',itemConsumed:1,source:{code:'V-021',totalBefore:1,totalAfter:0},result:{mercenaryCode:'V-046',rank:'SSS',quantity:1,name:'라그니엘',totalCopiesAfter:1,duplicatesAfter:0}});
test('lost response survives a new client and receipt recovery never posts twice',async()=>{
 const storage=memory();let commits=0,saved,connected=true;
 const request=async(path,options)=>{if(options?.method==='POST'){commits++;saved=receipt(options.body.requestId);throw new TypeError('lost acknowledgement');}if(!connected)throw new TypeError('offline');return saved;};
 const options={accountId:7,storage,token:'same',currentToken:()=> 'same',locks:null,request};
 const a=createRerollClient(options);await assert.rejects(a.run('V-021'));const pending=a.pending();assert.equal(commits,1);assert.ok(pending);
 const b=createRerollClient(options);connected=false;await assert.rejects(b.run('V-049'));assert.deepEqual(b.pending(),pending);connected=true;
 assert.deepEqual(await b.run('V-049'),saved);assert.equal(commits,1);b.acknowledge(pending.requestId);assert.equal(b.pending(),null);
});
test('concurrent clicks share one request; user switch and storage failure stop spending',async()=>{
 const storage=memory();let posts=0,token='same';
 const c=createRerollClient({accountId:7,storage,token,currentToken:()=>token,locks:null,request:async(_path,options)=>{posts++;await new Promise(r=>setTimeout(r,5));return receipt(options.body.requestId);}});
 const [a,b]=await Promise.all([c.run('V-021'),c.run('V-021')]);assert.equal(a.requestId,b.requestId);assert.equal(posts,1);
 token='changed';await assert.rejects(c.run('V-021'),{code:'REROLL_SESSION'});assert.equal(posts,1);
 const broken=createRerollClient({accountId:7,token:'same',currentToken:()=> 'same',locks:null,storage:{getItem:()=>null,setItem:()=>{throw Error('full')}},request:()=>{throw Error('must not post')}});
 await assert.rejects(broken.run('V-021'),{code:'REROLL_STORAGE'});
});
test('pending cancellation releases the client; unknown errors retain it; receipts reject same card and wrong account',async()=>{
 const storage=memory(),p={requestId:'saved-reroll-request-0001',sourceCode:'V-021'};storage.setItem(rerollPendingKey(7),JSON.stringify(p));
 const c=createRerollClient({accountId:7,storage,token:'same',currentToken:()=> 'same',locks:null,request:()=>{throw Object.assign(Error('cancelled'),{code:'JOINT_OPERATION_SUPERSEDED'})}});
 await assert.rejects(c.run(null));assert.equal(c.pending(),null);
 const r=receipt(p.requestId);assert.throws(()=>validateRerollReceipt({...r,accountId:8},p.requestId,7));assert.throws(()=>validateRerollReceipt({...r,result:{...r.result,mercenaryCode:'V-021'}},p.requestId,7));
});
