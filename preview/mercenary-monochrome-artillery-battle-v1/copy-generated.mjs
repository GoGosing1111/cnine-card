import fs from 'node:fs';
import path from 'node:path';
const [key,generated]=process.argv.slice(2);if(!/^[a-z0-9-]+$/.test(key)||!generated)throw Error('Usage: copy-generated.mjs key generated.png');
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const dest=path.join(root,'assets/sources',key+'.png');fs.copyFileSync(generated,dest,fs.constants.COPYFILE_EXCL);console.log(dest);
