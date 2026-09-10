// All geometry uses metres. Only data/measurements.json supplies displayed dimensions.
export const config = {
  room: { width: 3.3, length: 6.6, height: 2.65, balconyDepth: .9 },
  layout: { endClearance: .3, independentGap: .008 },
  // Appearance and installation allowances: never included in the measurement UI.
  approximation: { wallThickness: .1, frameWidth: .025, ladderDepthFromWall: 1.1 },
};

export function getLayout() {
  const { length } = config.room;
  const { endClearance, independentGap } = config.layout;
  const slotLength = (length - 2 * endClearance - independentGap) / 3;
  const leftStarts = [endClearance, endClearance + slotLength, endClearance + 2 * slotLength + independentGap];
  const rightStarts = [endClearance, endClearance + slotLength + independentGap, endClearance + 2 * slotLength + independentGap];
  const numbers = { left: [1, 2, 3], right: [6, 5, 4] };
  return ['left', 'right'].flatMap(side => (side === 'left' ? leftStarts : rightStarts).map((start, i) => ({
    number: numbers[side][i], side, start, end: start + slotLength,
    center: start + slotLength / 2, slotLength,
    // Facing any desk from the aisle, the wardrobe is on the viewer's left.
    // Local +x points toward the balcony on both rows after scene transforms:
    // viewer-left is the entrance end on the left row and balcony end on the right.
    wardrobeEnd: side === 'left' ? 'entrance' : 'balcony',
    omitStartRail: side === 'left' && i === 1 || side === 'right' && i === 2,
    omitEndRail: false,
  })));
}

export const targetLabels = {
  unit: '床位组合', bed: '床与护栏', wardrobe: '衣柜', desk: '桌面', keyboard: '键盘架',
  drawer: '抽屉', computerCabinet: '机柜', bookshelf: '上方书架', bookcase: '侧边书柜',
  ladder: '垂直梯子', chair: '座椅', room: '寝室空间', aisle: '中央过道', balcony: '阳台', fixture: '室内设施',
};
