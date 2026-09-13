import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {publicCodexHtml} from '../mercenary-codex/shell.mjs';
export {publicCodexHtml};
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  fs.writeFileSync(new URL('../mercenary-codex/index.html',import.meta.url),publicCodexHtml());
  console.log('Built native public mercenary archive');
}
