/**
 * Uniform-grid spatial hash over a fixed world rectangle.
 *
 * Used for worker separation and for pheromone-node lookup. Storage is a flat index array that is
 * cleared, not reallocated, each rebuild — allocation-free in the hot loop.
 */
export class SpatialHash {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  /** For each cell, the list of item ids currently inside it. */
  private buckets: number[][];

  constructor(width: number, height: number, cell: number) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    this.buckets = new Array(this.cols * this.rows);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
  }

  clear(): void {
    for (let i = 0; i < this.buckets.length; i++) {
      const b = this.buckets[i];
      if (b.length) b.length = 0;
    }
  }

  private index(x: number, y: number): number {
    let cx = Math.floor(x / this.cell);
    let cy = Math.floor(y / this.cell);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  insert(id: number, x: number, y: number): void {
    this.buckets[this.index(x, y)].push(id);
  }

  /**
   * Visits every id stored in cells overlapping the square of half-size `radius` around (x, y).
   * Callers must still do their own precise distance test.
   */
  query(x: number, y: number, radius: number, visit: (id: number) => void): void {
    const c = this.cell;
    let x0 = Math.floor((x - radius) / c);
    let x1 = Math.floor((x + radius) / c);
    let y0 = Math.floor((y - radius) / c);
    let y1 = Math.floor((y + radius) / c);
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= this.cols) x1 = this.cols - 1;
    if (y1 >= this.rows) y1 = this.rows - 1;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * this.cols;
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.buckets[row + cx];
        for (let i = 0; i < bucket.length; i++) visit(bucket[i]);
      }
    }
  }
}
