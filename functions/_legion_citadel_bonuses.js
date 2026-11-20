import {readCollectionBonuses} from './_collection_bonuses.js';

// Two party members ask the same read-only trophy questions at the same time.
// Keep each original query and its bound values; return native column types and
// the original row order to its caller. This scope ends when one party departs.
export async function readCitadelBonuses(env,users){
 if(env.DB.dialect!=='postgres'||users.length!==2)return Promise.all(users.map(u=>readCollectionBonuses(env,u.id)));
 const pending=new Map();
 async function flush(sql,kind,requests){
  try{
   const groups=[];
   for(const request of requests){
    let group=groups.find(g=>g.values.length===request.values.length&&g.values.every((v,i)=>Object.is(v,request.values[i])));
    if(!group){group={values:request.values,rows:[],callers:[]};groups.push(group);}
    group.callers.push(request);
   }
   if(groups.length===1){
    const g=groups[0],statement=env.DB.prepare(sql).bind(...g.values);
    if(kind==='first'){const row=await statement.first();if(row)g.rows.push(row);}
    else g.rows=(await statement.all()).results;
   }else{
    const queries=groups.map((g,index)=>{
     const limit=kind==='first'?' LIMIT 1':'';
     return 'SELECT '+index+' AS cnine_party_slot, row_number() OVER () AS cnine_party_order, result.* FROM (SELECT * FROM ('+sql+') AS source_row'+limit+') AS result';
    });
    const result=await env.DB.prepare(queries.join(' UNION ALL ')+' ORDER BY cnine_party_slot, cnine_party_order').bind(...groups.flatMap(g=>g.values)).all();
    for(const {cnine_party_slot,cnine_party_order,...row} of result.results)groups[Number(cnine_party_slot)].rows.push(row);
   }
   for(const g of groups)for(const r of g.callers)r.resolve(kind==='first'?(g.rows[0]??null):{results:g.rows});
  }catch(error){for(const r of requests)r.reject(error);}
 }
 function read(sql,kind,values){
  const key=kind+' '+sql;
  return new Promise((resolve,reject)=>{
   if(!pending.has(key)){
    const group=[];pending.set(key,group);
    queueMicrotask(()=>{pending.delete(key);void flush(sql,kind,group);});
   }
   pending.get(key).push({values,resolve,reject});
  });
 }
 const db={dialect:'postgres',prepare(sql){
  function bound(values){
   return {bind:(...args)=>bound(args),all:()=>read(sql,'all',values),
    async first(column){const row=await read(sql,'first',values);return column&&row?row[column]:row;}};
  }
  return bound([]);
 }};
 const scope={...env,DB:db};
 return Promise.all(users.map(u=>readCollectionBonuses(scope,u.id)));
}
