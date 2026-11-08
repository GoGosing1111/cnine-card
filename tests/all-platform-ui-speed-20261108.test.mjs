import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

for(const app of ['js/app.js','onestore/js/app.js']){
  const source=fs.readFileSync(new URL('../'+app,import.meta.url),'utf8');
  function fromFile(start,end,bindings={}){
    const offset=source.indexOf(start),limit=source.indexOf(end,offset);
    assert(offset>=0&&limit>offset);
    return vm.runInNewContext('('+source.slice(offset,limit).trim()+')',bindings);
  }
  const choose=fromFile('async function firstStartupCatalog(','function renderStartupRecovery(');
  const pending=()=>new Promise(()=>{});
  test(app+' opens with the first usable catalog and gives an already available server snapshot priority',async()=>{
    const authoritative=Promise.resolve({ok:true,value:{cards:[{id:'live'}]}});
    const staticCards=Promise.resolve([{id:'local'}]);
    assert.equal((await choose(authoritative,pending())).rows[0].id,'live');
    assert.equal((await choose(pending(),staticCards)).rows[0].id,'local');
    assert.equal((await choose(authoritative,staticCards)).rows[0].id,'live');
    assert.equal((await choose(Promise.resolve({ok:true,value:{cards:[]}}),pending())).rows.length,0);
  });
  test(app+' handles a failed provider, an empty fallback and a failed cold start',async()=>{
    const failure=Promise.resolve({ok:false,error:new Error('catalog offline')});
    assert.equal((await choose(failure,Promise.resolve([{id:'backup'}]))).server,false);
    assert.equal((await choose(Promise.resolve({ok:true,value:{cards:[{id:'live'}]}}),Promise.resolve([]))).server,true);
    await assert.rejects(choose(failure,Promise.resolve([])),/catalog offline/);
    await assert.rejects(choose(Promise.resolve({ok:true,value:{cards:null}}),Promise.resolve([])),/카드/);
  });
  test(app+' preserves filtered deck ordering, including identical names and ties, with bounded power calculations',()=>{
    const ranks={S:2,A:1},ctx={gradeOrder:ranks,cardDeckType:c=>c.type};let calls=0;
    ctx.battleCardPower=(card,user)=>{calls++;return card.base+user.bonus;};
    const filter=fromFile('function filterDeckCards(','// Empty editing slots',ctx);
    const list=Array.from({length:45},(_,i)=>({id:String(i),grade:i%2?'A':'S',type:i%2?'ATK':'HP',name:i%3?'가':'나',title:i%4?'동명':'이름',base:i%5}));
    const byGrade=(a,b)=>ranks[b.grade]-ranks[a.grade]||b.base-a.base;
    const byName=(a,b)=>a.name.localeCompare(b.name,'ko')||a.title.localeCompare(b.title,'ko');
    const byPower=(a,b)=>b.base-a.base||ranks[b.grade]-ranks[a.grade];
    for(const pve of [true,false])for(const sort of ['NAME_ASC','GRADE_DESC','POWER_DESC']){
      calls=0;const original=pve?[...list].sort(byGrade):list;
      const expected=original.filter(c=>c.type==='HP').sort(sort==='NAME_ASC'?byName:sort==='GRADE_DESC'?byGrade:byPower);
      const result=filter(list,{sort,type:'HP'},{bonus:3},{},pve);
      assert.deepEqual(result.map(c=>c.id),expected.map(c=>c.id));assert(calls<=result.length);
    }
  });
  test(app+' groups visible album cards once and preserves member order, card order and owned counts',()=>{
    const group=fromFile('function groupDexMembers(','function sortDexMembers(');
    const sequence=[{name:'두번째',id:'1'},{name:'첫번째',id:'2'},{name:'두번째',id:'3'}];
    const groups=group(sequence,new Set(['1','2']));
    assert.deepEqual([...groups.keys()],['두번째','첫번째']);
    assert.equal(groups.get('두번째').got,1);
    assert.deepEqual(Array.from(groups.get('두번째').list,c=>c.id),['1','3']);
  });
}
