import fs from 'node:fs/promises';
const file=new URL('../index.html',import.meta.url);let html=await fs.readFile(file,'utf8');
if(!html.includes('ui/advancement.css'))html=html.replace('<style>','<link rel="stylesheet" href="/css/command-ui-v1.css"><link rel="stylesheet" href="/preview/v35-advancement-fx-20261104/ui/advancement.css">\n<style>');
if(!html.includes('id="openAdvancement"'))html=html.replace('<b>전직 이펙트 검수</b>','<b>전직 준비 · 로컬 검수</b><button id="openAdvancement">전직창 열기</button><select id="state" aria-label="지속 효과"><option value="avenger-charge">복수자 충전</option><option value="shield-3">방패 3장</option><option value="shield-2">방패 2장</option><option value="shield-1">방패 1장</option><option value="commander">지휘관 상시</option></select><button id="showState">지속 효과</button>');
await fs.writeFile(file,html);
