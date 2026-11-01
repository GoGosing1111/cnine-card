import fs from 'node:fs/promises';
const transform=s=>s.replaceAll('ops:gingdeodeum-blackcrown-diim-grant:20261101:v1','ops:simsimi-blackcrown-bongsoon-exempt-grant:20261101:v1').replaceAll('gingdeodeum-blackcrown-diim-20261101','simsimi-blackcrown-bongsoon-20261101').replaceAll('깅더듬','심심이').replaceAll('디임','나무늘봉순').replaceAll('Gingdeodeum','Simsimi').replaceAll('Diim','Namuneulbongsoon').replaceAll('V-953','V-951').replaceAll('5877','4933').replaceAll('기존 한도는 그대로 두고 예외로 1장 지급','한도증가없이 1장 지급');
for(const file of ['independent.mjs','record-completion.mjs','finalize.mjs']){
 let content=transform(await fs.readFile(new URL('../gingdeodeum-blackcrown-diim-20261101/'+file,import.meta.url),'utf8'));
 if(file==='record-completion.mjs')content=content.replace('사용자 후속','사용자').replace("'preflight.mjs','prepare.mjs'","'preflight.mjs','prepare.mjs','prepare-verification.mjs'");
 if(file==='finalize.mjs')content=content.replace('사용자 “심심이 계정에 블랙크라운 ss 리미티드 나무늘봉순 지급해” 및 후속 “한도증가없이 1장 지급”에 따라','사용자 “심심이 계정에 블랙크라운 나무늘봉순 한도증가없이 1장 지급해”에 따라').replace('정확한 닉네임·기존 인증 신원과 블랙크라운 SS 카탈로그를 대조했다. 일반 나무늘봉순·블러드문 나무늘봉순·ICON 나무늘봉순과 다른 V-951이다.','정확한 닉네임·인증 신원과 블랙크라운 SS 카탈로그의 나무늘봉순 V-951을 대조했다.');
 await fs.writeFile(new URL('./'+file,import.meta.url),content,{flag:'wx'});
}
