import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [equipment,vehicle,app,vehicleUi,index,worker]=await Promise.all([
  read('functions/_equipment.js'),read('functions/_vehicle_draw.js'),read('js/app.js'),
  read('js/vehicle-draw-v1388.js'),read('index.html'),read('service-worker.js')
]);

assert.match(equipment,/SUPPLY_BOX_MAX_OPEN=100/);
assert.match(equipment,/offset<equipmentRewards\.length;offset\+=20/);
assert.doesNotMatch(equipment,/for\(const reward of equipmentRewards\)statements\.push/);
assert.equal((vehicle.match(/\[1,10,100\]\.includes\(count\)/g)||[]).length,2);
assert.match(app,/data-supply-buy="100"/);
assert.match(app,/data-vehicle-ticket-buy="100"/);
assert.match(app,/\[1,5,10,100\]/);
assert.match(app,/Math\.min\(100,Number\(ownedQuantity\)/);
assert.match(vehicleUi,/data-count="100"/);
assert.match(vehicleUi,/vehicleAgain100/);
assert.match(vehicleUi,/count>=100\?\[\.\.\.list\.reduce/);
assert.doesNotMatch(vehicleUi,/classList\.add\([^\n]*\?['"]hundred-result-v1724['"]:['"]['"]/);
assert.match(vehicleUi,/classList\.toggle\('hundred-result-v1724',count>=100\)/);
assert.match(index,/vehicle-draw-v1388\.js\?v=1726-result-class-fix/);
assert.match(index,/v=1729-virtual-card-lists/);
assert.match(worker,/soop-card-shell-v1731/);
console.log('equipment/vehicle 100 draw checks passed');
