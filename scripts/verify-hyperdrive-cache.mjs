import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const CACHE_ERROR='Hyperdrive query cache must be disabled for cnine-card (stale reads break draw/raid/energy).';

export function productionHyperdriveId(pagesToml,draftJson){
  const blocks=[...pagesToml.matchAll(/^\[\[hyperdrive\]\][ \t]*\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/gm)].map(match=>match[1]);
  const bindings=blocks.filter(block=>/^binding\s*=\s*["']HYPERDRIVE["']/m.test(block));
  if(bindings.length!==1)throw Error('Pages must declare exactly one production HYPERDRIVE binding.');
  const id=bindings[0].match(/^id\s*=\s*["']([a-f0-9]{32})["']/m)?.[1];
  if(!id)throw Error('Invalid production Hyperdrive id.');
  // This repository keeps the JSONC worker configuration JSON-compatible.
  const draft=JSON.parse(draftJson),workerBindings=draft.hyperdrive?.filter(x=>x.binding==='HYPERDRIVE');
  if(workerBindings?.length!==1||workerBindings[0].id!==id)throw Error('Pages and clan-draft must use the same production Hyperdrive id.');
  return id;
}

export function assertFreshHyperdrive(output,id,message=CACHE_ERROR){
  // Wrangler 4.125 emits a banner followed by JSON and has no --json option.
  const start=output.indexOf('{');
  let config;try{config=JSON.parse(output.slice(start));}catch{throw Error('Cannot verify Hyperdrive cache settings; deployment blocked.');}
  if(config?.id!==id)throw Error('Hyperdrive inspection returned an unexpected id; deployment blocked.');
  if(config?.caching?.disabled!==true)throw Error(message);
  return {id:config.id,cachingDisabled:true};
}

export function verifyProductionHyperdriveCache({root=process.cwd(),wrangler,env=process.env,inspect=execFileSync,message=CACHE_ERROR}){
  const id=productionHyperdriveId(readFileSync(join(root,'wrangler.toml'),'utf8'),readFileSync(join(root,'workers/clan-draft/wrangler.jsonc'),'utf8'));
  let output;
  try{output=inspect(process.execPath,[wrangler,'hyperdrive','get',id],{encoding:'utf8',env,stdio:['ignore','pipe','pipe'],timeout:30000});}
  catch{throw Error('Cannot inspect production Hyperdrive; deployment blocked. Check Wrangler authentication and retry.');}
  const verified=assertFreshHyperdrive(String(output),id,message);
  console.log(`[HYPERDRIVE OK] ${id} · query cache disabled · Pages/clan-draft bindings match`);
  return verified;
}
