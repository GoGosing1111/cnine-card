import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';

const here = new URL('./assets/', import.meta.url);
const icons = new URL('../../../assets/ui/project-v/skill-chips/', here);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const smooth = value => {
  const t = Math.max(0, Math.min(1, value));
  return t*t*(3-2*t);
};

// Repack each original simulation plate at a fixed world scale. The projectile
// tip and the floor under the fireball use the same anchor on every frame.
async function pack(name, sheets, columns, rows, outputCell, atlasColumns) {
  const parts = [], sources = [];
  const anchor = {x:.5,y:.89};
  for (const sheet of sheets) {
    const source = await readFile(new URL('source/' + sheet + '.png', here));
    const {data, info} = await sharp(source).raw().toBuffer({resolveWithObject:true});
    if (info.channels !== 4) throw Error(sheet + ' must have source alpha');
    sources.push({file:'source/'+sheet+'.png',sha256:hash(source)});
    // Match the last expanding fireball to the first rolling crown at their shared contact.
    const scale = sheet === 'ignition' ? .87 : 1;
    const size = Math.ceil(Math.max(info.width/columns,info.height/rows)*1.07/scale);
    for (let row=0; row<rows; row++) for (let col=0; col<columns; col++) {
      const left=Math.round(col*info.width/columns), top=Math.round(row*info.height/rows);
      const w=Math.round((col+1)*info.width/columns)-left, h=Math.round((row+1)*info.height/rows)-top;
      const cell=Buffer.alloc(size*size*4);
      let foot=Math.round(h*.962);
      // The last plate's ash disperses above a stationary floor, even after the floor disappears.
      if(sheet!=='tail'){
        for(let y=h-3;y>=0;y--){
          let opaque=0;
          for(let x=4;x<w-4;x++)if(data[((y+top)*info.width+left+x)*4+3]>80)opaque++;
          if(opaque>=Math.max(4,w*.016)){foot=y;break;}
        }
      }
      const dx=Math.round((size-w)/2), dy=Math.round(size*anchor.y)-foot;
      for(let y=0;y<h;y++){
        if(y+dy<2||y+dy>=size-2)continue;
        const floor = sheet === 'flight' ? smooth((y/h-.163)/.032) : smooth((foot+h*.012-y)/(h*.080));
        for(let x=0;x<w;x++){
          const from=((top+y)*info.width+left+x)*4, to=((y+dy)*size+x+dx)*4;
          const alpha=data[from+3];
          if(alpha<3)continue;
          const inset = Math.min(x,w-1-x,y,h-1-y);
          const edge = smooth(inset/(sheet === 'tail' ? 34 : 7));
          // The thinnest smoke carries a broad studio matte in the source plate.
          const opacity = sheet === 'tail' ? alpha*smooth((alpha-10)/78) : alpha;
          data.copy(cell,to,from,from+3);
          cell[to+3]=Math.round(opacity*edge*floor);
        }
      }
      const input=await sharp(cell,{raw:{width:size,height:size,channels:4}})
        .resize(outputCell,outputCell).png().toBuffer();
      const i=parts.length;
      parts.push({input,left:i%atlasColumns*outputCell,top:Math.floor(i/atlasColumns)*outputCell});
    }
  }
  const atlasRows=Math.ceil(parts.length/atlasColumns);
  const webp=await sharp({create:{width:atlasColumns*outputCell,height:atlasRows*outputCell,channels:4,background:'#00000000'}})
    .composite(parts).webp({lossless:true,effort:6}).toBuffer();
  await writeFile(new URL(name+'.webp',here),webp);
  return {sources,webpSha256:hash(webp),columns:atlasColumns,rows:atlasRows,cell:outputCell,anchor};
}

const flight=await pack('flight',['flight'],4,2,240,4);
const impact=await pack('impact',['ignition','crown','cooling','tail'],3,2,448,6);
impact.artReference={file:'source/impact.png',sha256:hash(await readFile(new URL('source/impact.png',here)))};
await writeFile(new URL('atlases.json',here),JSON.stringify({flight,impact},null,2)+'\n');

const chip = await readFile(new URL('source/chip.png',here));
const {width, height, hasAlpha} = await sharp(chip).metadata();
if (!hasAlpha) throw Error('The chip icon must have source alpha');
const png = await sharp(chip).resize(512,512,{fit:'contain',background:'#00000000'}).png().toBuffer();
const webp = await sharp(png).webp({lossless:true,effort:6}).toBuffer();
await writeFile(new URL('quantum-bomb-v1.png',icons),png);
await writeFile(new URL('quantum-bomb-v1.webp',icons),webp);
const manifestUrl = new URL('manifest-v1.json',icons);
const manifest = JSON.parse(await readFile(manifestUrl,'utf8'));
const record = {name:'quantum-bomb',status:'LOCAL_VISUAL_REVIEW',
  source:'/preview/battle-suit-quantum-bomb-v1/assets/source/chip.png',sourceWidth:width,sourceHeight:height,
  sourceSha256:hash(chip),image:'quantum-bomb-v1.webp',width:512,height:512,alpha:true,
  pngSha256:hash(png),webpSha256:hash(webp),bytes:webp.length};
manifest.assets = [...manifest.assets.filter(asset=>asset.name!==record.name),record];
await writeFile(manifestUrl,JSON.stringify(manifest,null,2)+'\n');
