// Explicit licensed recorded-Foley dependencies; no synthesized fallback.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('./assets/audio/',import.meta.url);await mkdir(folder,{recursive:true});
const clips=[['lock',1564,'Car door slam'],['driver',817,'Garage pneumatic screwer'],['ignition',1559,'Car start ignition'],['failure',1540,'Failed car ignition']];
const records=[];
for(const [name,id,title]of clips){
  const url=`https://assets.mixkit.co/active_storage/sfx/${id}/${id}.wav`;
  const response=await fetch(url);if(!response.ok)throw new Error(`${id}: HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.toString('ascii',0,4)!=='RIFF')throw new Error('Expected recorded WAV');
  await writeFile(new URL(`${name}.wav`,folder),bytes);
  records.push({name,id,title,sourceUrl:url,sourcePage:'https://mixkit.co/free-sound-effects/car/',local:`assets/audio/${name}.wav`,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,processing:'Original recorded WAV. Playback trim, 8 ms attack, 70 ms release and gain only. No pitch synthesis.'});
}
await writeFile(new URL('manifest.json',folder),JSON.stringify({license:'Mixkit Sound Effects Free License',licenseUrl:'https://mixkit.co/license/#sfxFree',retrievedAt:'2026-09-08',previewOnly:true,proceduralSynthesis:false,records},null,2)+'\n');
console.log('Four recorded mechanical sounds downloaded with provenance and hashes.');
