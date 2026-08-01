import { clamp, damp } from '../core/math.ts';
import { WORLD_H, WORLD_W } from '../sim/constants.ts';

/** Hard cap from ART_BIBLE: shake never exceeds this, and Reduced Shake scales it further. */
export const MAX_SHAKE = 9;

export class Camera {
  x = 0;
  y = 0;
  zoom = 1.5;
  shake = 0;
  shakeX = 0;
  shakeY = 0;
  private lookX = 0;
  private lookY = 0;
  private phase = 0;

  viewW = 1280;
  viewH = 720;

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    // Aim for ~1020 world units of horizontal view: a floor tile spans a third of the screen and the
    // scout is a readable ~40 px, which is the balance between the scale gag and tactile control.
    this.zoom = clamp(w / 1020, 1.15, 2.3);
  }

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.lookX = 0;
    this.lookY = 0;
    this.shake = 0;
  }

  /** Follows the scout with damped look-ahead, clamped so the camera never leaves the kitchen. */
  follow(tx: number, ty: number, vx: number, vy: number, dt: number, reducedShake: number): void {
    const lead = 0.34;
    this.lookX = damp(this.lookX, vx * lead, 0.0005, dt);
    this.lookY = damp(this.lookY, vy * lead, 0.0005, dt);

    const goalX = tx + this.lookX;
    const goalY = ty + this.lookY;
    this.x = damp(this.x, goalX, 0.0000009, dt);
    this.y = damp(this.y, goalY, 0.0000009, dt);

    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    this.x = clamp(this.x, Math.min(halfW, WORLD_W / 2), Math.max(WORLD_W - halfW, WORLD_W / 2));
    this.y = clamp(this.y, Math.min(halfH, WORLD_H / 2), Math.max(WORLD_H - halfH, WORLD_H / 2));

    this.phase += dt * 46;
    this.shake = Math.max(0, this.shake - dt * 26);
    const amp = Math.min(MAX_SHAKE, this.shake) * reducedShake;
    this.shakeX = Math.sin(this.phase * 1.7) * amp;
    this.shakeY = Math.cos(this.phase * 2.3) * amp;
  }

  addShake(amount: number): void {
    this.shake = Math.min(MAX_SHAKE * 2.2, this.shake + amount);
  }

  /** Visible world rectangle, with a margin, for culling. */
  bounds(margin = 120): { x0: number; y0: number; x1: number; y1: number } {
    const halfW = this.viewW / (2 * this.zoom) + margin;
    const halfH = this.viewH / (2 * this.zoom) + margin;
    return { x0: this.x - halfW, y0: this.y - halfH, x1: this.x + halfW, y1: this.y + halfH };
  }
}
