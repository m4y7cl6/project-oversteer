import * as THREE from 'three';

/** Procedural canvas textures so the prototype needs zero binary assets. */

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Asphalt with white edge lines and a dashed center line. U runs across the road. */
export function roadTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#3a3d44';
  ctx.fillRect(0, 0, 256, 256);
  // asphalt noise
  for (let i = 0; i < 2600; i++) {
    const g = 40 + Math.random() * 50;
    ctx.fillStyle = `rgba(${g},${g},${g + 6},0.5)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // edge lines
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(4, 0, 7, 256);
  ctx.fillRect(245, 0, 7, 256);
  // dashed center line
  ctx.fillStyle = '#d8c84a';
  for (let y = 0; y < 256; y += 64) ctx.fillRect(125, y, 6, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function checkerTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(128, 32);
  const cell = 16;
  for (let x = 0; x < 128 / cell; x++) {
    for (let y = 0; y < 32 / cell; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f5f5f5' : '#111111';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Red/white hazard stripes for barriers. */
export function barrierTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(128, 32);
  for (let x = 0; x < 8; x++) {
    ctx.fillStyle = x % 2 === 0 ? '#e53935' : '#fafafa';
    ctx.fillRect(x * 16, 0, 16, 32);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Speckled terrain tile; colors come from the track theme (grass/sand/asphalt). */
export function groundTexture(base: string, speckleA: string, speckleB: string): THREE.Texture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? speckleA : speckleB;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function grassTexture(): THREE.Texture {
  return groundTexture('#3d7a35', 'rgba(46,98,40,0.6)', 'rgba(88,150,70,0.5)');
}

/** Dark high-rise facade with a grid of randomly lit windows (city theme). */
export function buildingTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(128, 256);
  ctx.fillStyle = '#181c26';
  ctx.fillRect(0, 0, 128, 256);
  const litColors = ['#ffd97a', '#9adcf5', '#ffb347'];
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = Math.random() < 0.35;
      ctx.fillStyle = lit
        ? litColors[Math.floor(Math.random() * litColors.length)]
        : '#232836';
      ctx.fillRect(x, y, 9, 11);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial puff used by the smoke particle system. */
export function smokeTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(64, 64);
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/** Round dark blob used as a cheap kart shadow. */
export function blobShadowTexture(): THREE.Texture {
  const [c, ctx] = makeCanvas(64, 64);
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
