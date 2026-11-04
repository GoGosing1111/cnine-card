import fs from 'node:fs/promises';
const path=new URL('AdvancementWindow.mjs',import.meta.url);let source=await fs.readFile(path,'utf8');
source=source.replace("error||q.unavailable||q.insufficient?'is-error'", "error||view!=='success'&&(q.unavailable||q.insufficient)?'is-error'");
source=source.replace("q.missing[key]>0n?'is-short'", "view!=='success'&&q.missing[key]>0n?'is-short'");
source=source.replace('<span>${label}</span><strong>${cost}',"<span>${view==='success'?'소모 ':''}${label}</span><strong>${cost}");
source=source.replace("snapshot=result.snapshot;pending=null;view='success';notice='';onChanged(result);","snapshot=result.snapshot;pending=null;view='success';notice='';try{onChanged(result);}catch(callbackError){console.warn('Advancement UI change listener failed',callbackError);}");
await fs.writeFile(path,source);
