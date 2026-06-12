import { TrackData } from '../track/TrackData';
import { RacerEntry } from '../race/RaceManager';

/** Top-down track outline with live kart dots, drawn on a small 2D canvas. */
export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private outline: [number, number][] = [];

  constructor(private canvas: HTMLCanvasElement, track: TrackData) {
    this.ctx = canvas.getContext('2d')!;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.pos.x); maxX = Math.max(maxX, s.pos.x);
      minZ = Math.min(minZ, s.pos.z); maxZ = Math.max(maxZ, s.pos.z);
    }
    const pad = 14;
    this.scale = Math.min(
      (canvas.width - pad * 2) / (maxX - minX),
      (canvas.height - pad * 2) / (maxZ - minZ),
    );
    this.offsetX = pad + (canvas.width - pad * 2 - (maxX - minX) * this.scale) / 2 - minX * this.scale;
    this.offsetY = pad + (canvas.height - pad * 2 - (maxZ - minZ) * this.scale) / 2 - minZ * this.scale;

    for (let i = 0; i < track.sampleCount; i += 3) {
      const s = track.samples[i];
      this.outline.push([this.mapX(s.pos.x), this.mapY(s.pos.z)]);
    }
  }

  private mapX(x: number): number { return x * this.scale + this.offsetX; }
  private mapY(z: number): number { return z * this.scale + this.offsetY; }

  draw(entries: RacerEntry[], playerIndex: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.beginPath();
    this.outline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 4;
    ctx.stroke();

    entries.forEach((e, i) => {
      const p = e.kart.position;
      const x = this.mapX(p.x);
      const y = this.mapY(p.z);
      const isPlayer = i === playerIndex;
      ctx.beginPath();
      ctx.arc(x, y, isPlayer ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isPlayer
        ? '#00e5ff'
        : `#${e.kart.spec.color.toString(16).padStart(6, '0')}`;
      ctx.fill();
      if (isPlayer) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }
}
