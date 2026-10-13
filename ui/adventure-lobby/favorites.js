(function(global){
  'use strict';
  function create({getAccountId,routeIds,request,storage,onChange=()=>{}}){
    const allowed=new Set(routeIds),keyFor=id=>'cnine:menu-favorites:v1:'+id;
    let account='',routes=[],pending=new Set(),version=0,loadedAt=0,loading=null,error='',disposed=false;
    const clean=value=>Array.isArray(value)?[...new Set(value.filter(id=>allowed.has(id)))]:[];
    const emit=()=>{if(!disposed)onChange();};
    const persist=()=>{try{storage?.setItem(keyFor(account),JSON.stringify(routes));}catch{}};
    function setAccount(){
      const next=String(getAccountId?.()||'preview');
      if(next===account)return false;
      account=next;version++;pending=new Set();loadedAt=0;loading=null;error='';
      try{routes=clean(JSON.parse(storage?.getItem(keyFor(account))||'[]'));}catch{routes=[];}
      return true;
    }
    function snapshot(){setAccount();return {account,routes:[...routes],pending:new Set(pending),loading:!!loading,error};}
    async function refresh(force=false){
      const switched=setAccount();if(switched)emit();
      if(!request||account==='preview'||disposed)return;
      if(loading)return loading;
      if(!force&&Date.now()-loadedAt<15000)return;
      const owner=account,revision=version;
      const task=Promise.resolve().then(()=>request()).then(data=>{
        if(disposed||owner!==String(getAccountId?.()||'preview')||owner!==account||revision!==version)return;
        if(String(data.userId)!==owner)throw Error('즐겨찾기 계정을 확인하지 못했습니다. 다시 로그인해 주세요.');
        routes=clean(data.routes);loadedAt=Date.now();error='';persist();
      }).catch(()=>{
        if(!disposed&&owner===account&&revision===version){error='즐겨찾기를 불러오지 못했습니다. 다시 시도해 주세요.';loadedAt=Date.now();}
      }).finally(()=>{if(loading===task){loading=null;emit();}});
      loading=task;emit();return task;
    }
    async function toggle(route){
      setAccount();if(disposed||!allowed.has(route)||pending.has(route))return;
      const owner=account,wanted=!routes.includes(route);version++;pending.add(route);error='';emit();
      try{
        if(request){
          if(owner==='preview')throw Error('로그인이 필요합니다.');
          const data=await request({route,favorite:wanted});
          if(String(data.userId)!==owner||data.route!==route||data.favorite!==wanted)throw Error('저장 응답을 확인하지 못했습니다.');
        }
        if(disposed||owner!==String(getAccountId?.()||'preview')||owner!==account)return;
        routes=wanted?[...routes.filter(id=>id!==route),route]:routes.filter(id=>id!==route);persist();
      }catch{
        if(!disposed&&owner===account)error='즐겨찾기를 저장하지 못했습니다. 별표를 눌러 다시 시도해 주세요.';
      }finally{
        if(owner===account){version++;pending.delete(route);loadedAt=0;emit();}
      }
    }
    setAccount();
    return {snapshot,refresh,toggle,destroy(){disposed=true;version++;},storageChanged(key){if(key===null||key===keyFor(account)){loadedAt=0;void refresh(true);}}};
  }
  global.SoopMenuFavorites=Object.freeze({create});
})(window);
