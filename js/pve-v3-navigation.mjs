globalThis.PveV3Runtime={async tryOpen(content){
  if(content!=='tower')return false;
  const release=await fetch('/api/pve/v3/feature',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
  if(!release||release.publicContent?.TOWER?.policy==='LEGACY'||!release.enabled&&!release.publicContent?.TOWER?.enabled)return false;
  location.assign('/pve-v3/?content=tower');return true;
}};
