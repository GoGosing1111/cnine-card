// Share completed settings only. Pending database work belongs to the request
// that owns the connection; another request must never wait behind its queue.
export function createRequestSettingsCache({now=Date.now}={}){
  const namespaces=new Map(),pending=new WeakMap(),generations=new Map();
  let objectNamespaces=new WeakMap();
  let sequence=0,epoch=0;
  const generation=key=>`${epoch}:${generations.get(key)||0}`;
  const namespace=env=>{
    const scope=env.RUNTIME_DB_CACHE_SCOPE||env.DB||env;
    if(typeof scope==='object'||typeof scope==='function'){
      if(!objectNamespaces.has(scope))objectNamespaces.set(scope,new Map());
      return objectNamespaces.get(scope);
    }
    if(!namespaces.has(scope)){
      if(namespaces.size>=16)namespaces.delete(namespaces.keys().next().value);
      namespaces.set(scope,new Map());
    }
    return namespaces.get(scope);
  };
  const cache={
    load(env,key,ttlMs,loader){
      const store=namespace(env),stamp=generation(key),started=now(),cached=store.get(key);
      if(cached?.generation===stamp&&cached.expiresAt>started)return Promise.resolve(cached.value);
      let requests=pending.get(env);if(!requests){requests=new Map();pending.set(env,requests);}
      const previous=requests.get(key);
      if(previous?.generation===stamp)return previous.promise;
      const order=++sequence,entry={generation:stamp,promise:null};
      entry.promise=Promise.resolve().then(loader).then(value=>{
        // A late read must not undo a CMS save or a newer successful read.
        if(generation(key)===stamp&&(!store.has(key)||store.get(key).order<order)){
          if(store.size>=128&&!store.has(key))store.delete(store.keys().next().value);
          store.set(key,{value,generation:stamp,order,expiresAt:started+ttlMs});
        }
        return value;
      }).finally(()=>{if(requests.get(key)===entry)requests.delete(key);});
      requests.set(key,entry);
      return entry.promise;
    },
    delete(key){
      generations.set(key,(generations.get(key)||0)+1);
      for(const store of namespaces.values())store.delete(key);
    },
    clear(){epoch++;namespaces.clear();objectNamespaces=new WeakMap();generations.clear();},
    set(env,key,value,ttlMs){
      cache.delete(key);
      namespace(env).set(key,{value,generation:generation(key),order:++sequence,expiresAt:now()+ttlMs});
    }
  };
  return cache;
}
