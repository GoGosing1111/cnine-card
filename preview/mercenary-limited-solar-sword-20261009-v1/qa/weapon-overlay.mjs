import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const file=p=>fileURLToPath(new URL(p,import.meta.url));
const source=file('../../../assets/ui/project-v/mercenaries/approved-20261009/solar-sword-sss-limited-source-art.png');
const blade=await sharp(file('../assets/locked/approved-blade.png')).tint('#00ddff').modulate({brightness:.7}).png().toBuffer();
await sharp(source).composite([{input:blade,left:90,top:510}]).png().toFile(file('weapon-old-selection.png'));
