import * as THREE from 'three';

// Procedural surface appearance only; this does not add measured geometry.
function woodTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c49455'; ctx.fillRect(0, 0, 256, 512);
  let seed = 27;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 460; i++) {
    const x = random() * 256;
    ctx.strokeStyle = `rgba(${random() > .5 ? '87,51,22' : '249,219,165'},${.03 + random() * .1})`;
    ctx.lineWidth = .3 + random() * 1.5;
    ctx.beginPath(); ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 5, 160, x - 5, 340, x + 2, 512); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createMaterials() {
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, ...extra });
  const wood = material('#e5bd82', { map: woodTexture(), roughness: .54 });
  return {
    wood,
    woodDark: material('#856039', { map: wood.map, roughness: .78 }),
    metal: material('#c4ccbf', { roughness: .36, metalness: .32 }),
    black: material('#343c37', { roughness: .68 }),
    white: material('#f1f1e8', { roughness: .65 }),
    wall: material('#f3f0e6', { roughness: .98, side: THREE.DoubleSide }),
    floor: material('#d7d9cf', { roughness: .42 }),
    grout: material('#b7bdb3', { roughness: .92 }),
    fabric: material('#91bcb0', { roughness: .96 }),
    blue: material('#316779', { roughness: .95 }),
    door: material('#694334', { roughness: .58 }),
    glass: material('#a6c7c7', { transparent: true, opacity: .2, roughness: .16, metalness: .05, depthWrite: false }),
  };
}
