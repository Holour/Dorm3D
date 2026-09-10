import { measurements } from './measurements.js';
import { targetLabels } from './model/config.js';

function normalize(value) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[一二三四五六]/g, char => String('一二三四五六'.indexOf(char) + 1))
    .replace(/置物区|置物格|分区|格子|格|层|第|个/g, '')
    .replace(/深度|进深/g, '深').replace(/宽度/g, '宽').replace(/高度/g, '高')
    .replace(/\s+/g, '');
}

// Search only the measured catalogue. Installation estimates never enter it.
export function searchMeasurements(query) {
  const bedMatch = query.match(/([1-6一二三四五六])\s*号?床/);
  const bedNumber = bedMatch ? Number(normalize(bedMatch[1])) : null;
  const text = normalize(query.replace(bedMatch?.[0] || /$^/, ''));
  if (!text) return { bedNumber, records: bedNumber ? measurements : [] };
  const records = measurements.filter(record => {
    const haystack = normalize(`${targetLabels[record.target]}${record.label}${record.qualifier}`);
    const fragments = text.match(/[a-z0-9]+|[^a-z0-9]+/g) || [];
    return fragments.every(fragment => haystack.includes(fragment));
  });
  return { bedNumber, records };
}
