import fs from 'node:fs';
import path from 'node:path';
import {planReshuffle} from '../../../scripts/ops/clan-reshuffle-plan-20261025.mjs';
const [directory]=process.argv.slice(2),out=path.resolve(directory);
const plan=planReshuffle(JSON.parse(fs.readFileSync(path.join(out,'history.json'))),JSON.parse(fs.readFileSync(path.join(out,'ratings.json'))));
fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({planHash:plan.planHash,...plan.stats}));
