import catalog from '../data/measurements.json' with { type: 'json' };

export const measurements = catalog.measurements.filter(item => item.display === true);
export const furnitureTargets = ['bed','wardrobe','desk','keyboard','drawer','computerCabinet','bookshelf','bookcase'];

export function recordsFor(target) {
  return measurements.filter(item => target === 'unit' ? furnitureTargets.includes(item.target) : item.target === target);
}

export function formatMeasurement(item) {
  return `${typeof item.value === 'number' ? item.value : `${item.value.min}–${item.value.max}`} cm`;
}

export function exportRecords(target) {
  return recordsFor(target).map(({ id, label, value, qualifier, source }) => ({ id, label, value, unit: 'cm', qualifier, source }));
}
