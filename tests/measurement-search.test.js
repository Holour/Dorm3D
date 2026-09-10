import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMeasurements } from '../src/measurement-search.js';

test('尺寸搜索识别中文格号、指定床号，并只返回原始实测记录', () => {
  assert.deepEqual(searchMeasurements('衣柜第二格').records.map(r => r.id), ['wardrobe.zone2Height']);
  const found = searchMeasurements('三号床 衣柜第二格');
  assert.equal(found.bedNumber, 3);
  assert.deepEqual(found.records.map(r => r.id), ['wardrobe.zone2Height']);
  assert.ok(searchMeasurements('床板厚度').records.some(r => r.id === 'bed.boardThickness'));
  assert.equal(searchMeasurements('挡板厚度').records.length, 0);
  assert.equal(searchMeasurements('').records.length, 0);
  assert.ok(searchMeasurements('衣柜').records.every(r => r.display === true && r.source === 'docs/寝室空间尺寸.md'));
});
