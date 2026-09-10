import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import validator from 'gltf-validator';

const file = new URL('../exports/Dorm3D.glb', import.meta.url);
const bytes = await fs.readFile(file);
const report = await validator.validateBytes(new Uint8Array(bytes), { uri: 'Dorm3D.glb', maxIssues: 100 });
assert.equal(report.issues.numErrors, 0, 'GLB validation errors: ' + JSON.stringify(report.issues.messages));
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
const units = gltf.nodes.filter(node => /^bed-unit-[1-6]$/.test(node.name || ''));
assert.equal(units.length, 6);
const catalog = JSON.parse(await fs.readFile(new URL('../data/measurements.json', import.meta.url), 'utf8'));
const expected = new Map(catalog.measurements.map(item => [item.id, item]));
const exportedIds = new Set();
for (const node of gltf.nodes) {
  for (const item of node.extras?.measurements || []) {
    const original = expected.get(item.id);
    assert.ok(original, 'Unexpected dimension exported: ' + item.id);
    assert.deepEqual(item.value, original.value);
    exportedIds.add(item.id);
  }
}
assert.equal(exportedIds.size, expected.size);
assert.equal(gltf.nodes.filter(node => node.extras?.target === 'chair').length, 6);
assert.equal(gltf.nodes.filter(node => node.extras?.target === 'ladder').length, 4);
console.log(JSON.stringify({file:'exports/Dorm3D.glb',bytes:bytes.length,errors:report.issues.numErrors,warnings:report.issues.numWarnings,bedUnits:units.length,measurementIds:exportedIds.size,meshCount:gltf.meshes.length},null,2));
if(report.issues.numWarnings)console.log(JSON.stringify(report.issues.messages,null,2));
