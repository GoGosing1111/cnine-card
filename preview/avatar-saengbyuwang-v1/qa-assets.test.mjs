import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

test('Saengbyuwang originals and runtime assets retain their declared dimensions and hashes',async()=>{
  const manifest=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url),'utf8'));
  for(const [name,expected] of Object.entries(manifest.files)){
    const bytes=await readFile(new URL(`./assets/${name}`,import.meta.url)),meta=await sharp(bytes).metadata();
    assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256,name);
    assert.deepEqual([meta.width,meta.height,meta.hasAlpha],[expected.width,expected.height,expected.hasAlpha],name);
    if(name==='avatar-saengbyuwang-equipment-v1-640.webp')assert.deepEqual([meta.width,meta.height],[640,1664]);
    else assert.equal(meta.width*3,meta.height*2,name);
  }
  assert.equal(manifest.files['avatar-saengbyuwang-lobby-source-art-v1.png'].sha256,'728880e0701bc5bd052e798284a1bc384e0b68ce0bf0952ef5399bdae360206e');
});

test('equipment PNG and WebP contain a complete isolated figure with transparent borders and opaque clothing',async()=>{
  for(const name of ['avatar-saengbyuwang-equipment-source-art-v1.png','avatar-saengbyuwang-equipment-v1-640.webp']){
    const bytes=await readFile(new URL(`./assets/${name}`,import.meta.url));
    assert.equal((await sharp(bytes).metadata()).hasAlpha,true,name);
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let clear=0,solid=0,minY=info.height,maxY=-1;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a>=240)solid++;
      if(a>16){minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      if(x===0||y===0||x===info.width-1||y===info.height-1)assert.ok(a<=2,`${name}: opaque border at ${x},${y}`);
    }
    assert.ok(clear/(info.width*info.height)>.65,name);
    assert.ok(solid/(info.width*info.height)>.15,name);
    assert.ok(minY>=info.height*.01&&maxY<info.height*.99,`${name}: head or feet clipped`);
    for(const [x,y] of [[.52,.1],[.51,.27],[.51,.68]])assert.ok(data[(Math.floor(y*info.height)*info.width+Math.floor(x*info.width))*4+3]>=240,`${name}: translucent face, swimsuit or leg`);
  }
});

test('background extraction leaves opaque character RGB identical to the generated art',async()=>{
  const original=await sharp(await readFile(new URL('./assets/avatar-saengbyuwang-equipment-draft-v1.png',import.meta.url))).ensureAlpha().raw().toBuffer();
  const final=await sharp(await readFile(new URL('./assets/avatar-saengbyuwang-equipment-source-art-v1.png',import.meta.url))).ensureAlpha().raw().toBuffer();
  assert.equal(original.length,final.length);
  let compared=0;
  for(let p=0;p<final.length;p+=4)if(final[p+3]===255){for(let c=0;c<3;c++)assert.equal(final[p+c],original[p+c]);compared++;}
  assert.ok(compared>250000);
});
