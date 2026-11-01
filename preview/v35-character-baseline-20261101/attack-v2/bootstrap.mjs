import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url));
await fs.mkdir(path.join(dir,'qa'),{recursive:true});
for(const name of ['native.mjs','build.mjs','review.src.mjs','index.html','serve.mjs']){
 let text=await fs.readFile(path.join(dir,'../attack-v1',name),'utf8');
 if(name==='serve.mjs')text=text.replaceAll('18764','18765');
 if(name==='index.html')text=text.replace('<a href="qa/weapon-v2-light.png">수정한 칼</a> · ','').replace('기본 베기 검토용입니다.','전진 베기 수정본입니다.');
 if(name==='review.src.mjs')text=text.replace('준비 → 가속 → 접촉 → 회수','체중 싣기 → 앞발 착지 → 베기 → 회수').replace('for(const [x,y]of [[143-512,1450-1440],[846-512,1450-1422]])','for(const [x,y]of [[143-512,1450-1440],[846-512,1450-1422],[966-512,1450-1422]])');
 await fs.writeFile(path.join(dir,name),text,{flag:'wx'});
}
await fs.writeFile(path.join(dir,'.gitattributes'),'* -text\n',{flag:'wx'});
console.log('Small review scripts prepared; source images and dependencies are reused.');
