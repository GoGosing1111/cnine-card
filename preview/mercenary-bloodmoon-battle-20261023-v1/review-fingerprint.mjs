import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const readReviewFile=name=>fs.readFile(new URL(name,import.meta.url));
export const fileSha=async name=>createHash('sha256').update(await readReviewFile(name)).digest('hex');
export async function reviewFingerprint(){
 const manifest=JSON.parse(await readReviewFile('manifest.json'));
 const files=['preview.bundle.js','preview.css','index.html','battle.html','fit-preview.mjs','source/gallery.js','balance.mjs'];
 const hashes=await Promise.all(files.map(async name=>[name,await fileSha(name)]));
 return createHash('sha256').update(JSON.stringify({characters:manifest.characters,ui:manifest.ui,hashes})).digest('hex');
}
