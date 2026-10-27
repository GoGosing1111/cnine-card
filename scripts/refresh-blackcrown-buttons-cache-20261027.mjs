import fs from 'node:fs';
const files=['index.html','js/app.js','js/mercenary-blackcrown-pack-live.mjs','admin/mercenary-admin-v1.js','admin/index.html','service-worker.js'];
for(const file of files){const old=fs.readFileSync(file,'utf8'),next=old.replaceAll('20261027-off-ss10-v2','20261027-buttons-v4').replaceAll('blackcrown-off-ss10-20261027-v2','blackcrown-buttons-20261027-v4').replaceAll('20261027-buttons-v3','20261027-buttons-v4').replaceAll('blackcrown-buttons-20261027-v3','blackcrown-buttons-20261027-v4');if(next!==old)fs.writeFileSync(file,next);}
