const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = __dirname;
const jobs = JSON.parse(fs.readFileSync(path.join(root, 'prompts-framed.json'), 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
(async () => {
  const assets = [];
  for (const job of [{number: 0, outputPath: jobs.frame.outputPath}, ...jobs.icons]) {
    const id = job.number ? 'weapon-' + String(job.number).padStart(2, '0') : 'frame-background';
    const master = path.join(root, 'masters', id + '-framed-master.png');
    const target = path.join(root, 'assets', id + '-512.png');
    fs.copyFileSync(job.outputPath, master);
    const meta = await sharp(master).metadata();
    if (meta.width !== meta.height) throw new Error(id + ' must have square native composition');
    // Delivery-size export only. Artwork, palette, orientation and composition were authored by image_gen.
    await sharp(master).resize(512, 512, {fit: 'contain', kernel: 'lanczos3'}).png({compressionLevel: 9}).toFile(target);
    const exported = await sharp(target).metadata();
    if (exported.width !== 512 || exported.height !== 512) throw new Error('Invalid delivery dimensions');
    assets.push({
      number: job.number,
      role: job.number ? 'framed-weapon-icon' : 'shared-frame-and-backdrop',
      path: 'assets/' + path.basename(target),
      width: exported.width,
      height: exported.height,
      bytes: fs.statSync(target).size,
      sha256: sha(target),
      masterPath: 'masters/' + path.basename(master),
      masterWidth: meta.width,
      masterHeight: meta.height,
      masterSha256: sha(master),
      muzzleDirection: job.number ? 'LEFT' : null,
      colorPolicy: job.number === 4 ? 'Original white/silver, black, gold and ivory pearl palette preserved' : job.number ? 'Champagne gold and silver, dark mechanical recesses' : 'Gold and silver frame, burgundy-black background'
    });
  }
  const references = [1,2,3,4].map(number => {
    const relative = 'sources/weapon-' + String(number).padStart(2, '0') + '-reference.png';
    return {number, path: relative, sha256: sha(path.join(root, relative))};
  });
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    version: 1,
    date: '2026-10-08',
    status: 'PREVIEW_READY',
    task: 'Eastern Arms Merchant style gold/silver weapons with 512x512 square frames',
    tool: jobs.tool,
    sourcePreservation: 'Original attachments copied without modifications',
    export: 'Native image_gen artwork uniformly downsampled with Lanczos3; no repaint, crop, palette or geometry changes',
    visualReview: {
      muzzleDirection: 'All four final framed icons face left',
      rigidAxis: 'Receiver, barrel and muzzle checked continuously; no visible bends at their connections',
      completeness: 'Muzzle, stock, magazines, charms, pearls and corner ornaments visible',
      color4: 'White/black/gold palette, pearl chains and warm bottle retained',
      resolution: 'All delivery assets exactly 512x512'
    },
    runtimeConnected: false,
    equipmentRegistrationChanged: false,
    initialCutouts: 'masters/weapon-XX-cutout-initial.png are the preserved first-generation sources, before the all-left framed follow-up',
    references,
    assets
  }, null, 2) + '\n');
  console.log(JSON.stringify(assets.map(({number,width,height,bytes,path})=>({number,width,height,bytes,path})),null,2));
})().catch(error => { console.error(error); process.exitCode = 1; });
