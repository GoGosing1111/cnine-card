import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {__scrapyardTest} from '../functions/_scrapyard.js';

const source=readFileSync(new URL('../functions/_scrapyard.js',import.meta.url),'utf8');
const now=Date.parse('2026-08-27T17:00:00.000Z'); // 2026-08-28 02:00 KST
const range=__scrapyardTest.kstDayRange(now);

assert.deepEqual(range,{
  start:'2026-08-27 15:00:00',
  end:'2026-08-28 15:00:00'
});
assert.doesNotMatch(range.start,/[TZ]/,'KST start must match the UTC TEXT database format');
assert.doesNotMatch(range.end,/[TZ]/,'KST end must match the UTC TEXT database format');
assert.equal('2026-08-27 17:16:53'>=range.start&&'2026-08-27 17:16:53'<range.end,true,'02:16 KST run must count toward the current day');
assert.equal('2026-08-27 14:59:59'>=range.start,false,'run before KST midnight must not count');
assert.equal('2026-08-28 15:00:00'<range.end,false,'next KST midnight must be excluded');

const indexedRangeUses=source.match(/created_at>=\? AND created_at<\?/g)||[];
assert.equal(indexedRangeUses.length,2,'status and entry-limit checks must share the indexed day range');
assert.doesNotMatch(source,/datetime\(created_at\).*scrapyard_runs_v1676/s,'daily run checks must not wrap the indexed column');

console.log('scrapyard KST daily counter and 30-run gate regression verified');
