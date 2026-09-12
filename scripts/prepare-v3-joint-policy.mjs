import fs from 'node:fs/promises';
import path from 'node:path';
import {collectJointReleaseSchema,compileJointReleaseDocument} from '../functions/_joint_release_preparation.js';
import {V3_JOINT_RELEASE_ENABLED,V3_JOINT_RELEASE_VERSION} from '../shared/v3-joint-release-v1.mjs';

const args=process.argv.slice(2);
if(args.includes('--help')){
 console.log('node scripts/prepare-v3-joint-policy.mjs --output <local-directory> [--input <explicitly-approved-policy.json>]\nWrites reviewable SQLite/PostgreSQL schema and optionally an approved policy envelope. Never connects to a database, activates features, or deploys.');
}else{
 const allowed=new Set(['--output','--input']);for(let i=0;i<args.length;i+=2)if(!allowed.has(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Expected --output <directory> [--input <policy.json>]');
 const options=Object.fromEntries(Array.from({length:args.length/2},(_,i)=>[args[i*2],args[i*2+1]]));
 if(!options['--output'])throw Error('--output is required');
 const output=path.resolve(options['--output']);await fs.mkdir(output,{recursive:true});
 for(const postgres of[false,true]){
  const rows=await collectJointReleaseSchema({postgres});
  await fs.writeFile(path.join(output,`schema-${postgres?'postgresql':'sqlite'}.sql`),'-- Joint release preparation. Existing data and CMS choices are preserved.\nBEGIN;\n'+rows.join(';\n')+';\nCOMMIT;\n');
 }
 let policy=null;
 if(options['--input']){
  const input=JSON.parse(await fs.readFile(path.resolve(options['--input']),'utf8'));
  const compiled=await compileJointReleaseDocument(input),envelope=JSON.parse(compiled.value);
  await fs.writeFile(path.join(output,'approved-policy-envelope.json'),JSON.stringify(envelope,null,2)+'\n');
  const quote=value=>"'"+value.replaceAll("'","''")+"'",key=quote(compiled.key),value=quote(compiled.value),guard=quote('publish-'+envelope.sha256);
  const sql=`-- Apply only during the user-approved joint update. The code release flag remains separate.\nBEGIN;\nINSERT INTO joint_atomic_guards_v1(token,verified) SELECT ${guard},CASE WHEN NOT EXISTS(SELECT 1 FROM app_meta WHERE key=${key} AND value<>${value}) THEN 1 ELSE 0 END;\nINSERT INTO app_meta(key,value) VALUES(${key},${value}) ON CONFLICT(key) DO NOTHING;\nDELETE FROM joint_atomic_guards_v1 WHERE token=${guard};\nCOMMIT;\n`;
  await fs.writeFile(path.join(output,'publish-approved-policy.sql'),sql);policy={key:compiled.key,sha256:envelope.sha256};
 }
 await fs.writeFile(path.join(output,'candidate.json'),JSON.stringify({version:V3_JOINT_RELEASE_VERSION,releaseFlag:V3_JOINT_RELEASE_ENABLED,policy,execution:'LOCAL_FILES_ONLY',deployment:'HELD',createdAt:new Date().toISOString()},null,2)+'\n');
 console.log(`Joint schema${policy?' and explicitly approved policy':''} prepared in ${output}. No database connection or deployment.`);
}
