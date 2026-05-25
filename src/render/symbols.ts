type Ctx = CanvasRenderingContext2D;

function setupComponent(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angle);
  return { len, angle };
}

export function drawWire(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function drawResistor(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  const { len } = setupComponent(ctx, x1, y1, x2, y2);
  const bodyLen = len * 0.5;
  const peaks = 6;
  const peakW = bodyLen / peaks;
  const peakH = 8;

  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(-bodyLen / 2, 0);
  for (let i = 0; i < peaks; i++) {
    const x = -bodyLen / 2 + i * peakW;
    const dir = i % 2 === 0 ? -1 : 1;
    ctx.lineTo(x + peakW / 2, dir * peakH);
    ctx.lineTo(x + peakW, 0);
  }
  ctx.lineTo(len / 2, 0);
  ctx.stroke();
  ctx.restore();
}

export function drawCapacitor(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  const { len } = setupComponent(ctx, x1, y1, x2, y2);
  const gap = 6;
  const plateH = 16;

  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(-gap / 2, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-gap / 2, -plateH / 2);
  ctx.lineTo(-gap / 2, plateH / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(gap / 2, -plateH / 2);
  ctx.lineTo(gap / 2, plateH / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(gap / 2, 0);
  ctx.lineTo(len / 2, 0);
  ctx.stroke();
  ctx.restore();
}

export function drawVoltageSource(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  const { len } = setupComponent(ctx, x1, y1, x2, y2);
  const r = 14;

  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(-r, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // + sign (near first terminal)
  ctx.beginPath();
  ctx.moveTo(-r / 2 - 3, 0);
  ctx.lineTo(-r / 2 + 3, 0);
  ctx.moveTo(-r / 2, -3);
  ctx.lineTo(-r / 2, 3);
  ctx.stroke();

  // − sign (near second terminal)
  ctx.beginPath();
  ctx.moveTo(r / 2 - 3, 0);
  ctx.lineTo(r / 2 + 3, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(len / 2, 0);
  ctx.stroke();
  ctx.restore();
}

export function drawGround(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  const { len } = setupComponent(ctx, x1, y1, x2, y2);
  const barGap = 4;
  const widths = [16, 10, 4];

  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(0, 0);
  ctx.stroke();

  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * barGap, -widths[i] / 2);
    ctx.lineTo(i * barGap, widths[i] / 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawInductor(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  const { len } = setupComponent(ctx, x1, y1, x2, y2);
  const bodyLen = len * 0.5;
  const bumps = 4;
  const bumpW = bodyLen / bumps;
  const bumpH = 6;

  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(-bodyLen / 2, 0);
  for (let i = 0; i < bumps; i++) {
    const cx = -bodyLen / 2 + (i + 0.5) * bumpW;
    const startX = -bodyLen / 2 + i * bumpW;
    ctx.arcTo(cx, -bumpH * 2, startX + bumpW, 0, bumpH);
    ctx.lineTo(startX + bumpW, 0);
  }
  ctx.lineTo(len / 2, 0);
  ctx.stroke();
  ctx.restore();
}

export function drawDot(ctx: Ctx, x: number, y: number, radius = 3): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
