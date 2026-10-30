export const DIM = [58, 58, 58];
export const LIT = [242, 242, 242];
export const NIB = [255, 255, 255];

export const OPEN_AT = 0.34;
export const CLOSE_AT = 0.08;

export function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * How far one line has been read.
 * The wet edge is a single line tall, so the line above is already finished
 * and the line below has not started. That keeps the fill horizontal.
 */
export function lineProgress(lineY, viewportHeight, lineHeight = 32) {
  const span = Math.max(lineHeight, 1);
  const focus = viewportHeight * 0.5;
  const zoneStart = focus + span;
  return clamp01((zoneStart - lineY) / span);
}

/**
 * Ink for one character in a line.
 * `progress` moves a reading head left to right; `softness` is the width of the wet edge, in characters.
 */
export function charInk(progress, index, count, softness = 1.65) {
  if (count <= 1) return clamp01(progress);
  const head = progress * (count - 1 + softness);
  return clamp01((head - index) / softness);
}

function channel(ink, index) {
  const edge = ink > 0 && ink < 1 ? Math.sin(ink * Math.PI) : 0;
  const base = DIM[index] + (LIT[index] - DIM[index]) * ink;
  return Math.round(base + (NIB[index] - base) * edge * 0.9);
}

export function inkColor(ink) {
  return `rgb(${channel(ink, 0)} ${channel(ink, 1)} ${channel(ink, 2)})`;
}

export const DIM_COLOR = inkColor(0);
export const LIT_COLOR = inkColor(1);

export function groupLines(items, tolerance) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];

  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(item.y - last[0].y) > tolerance) {
      lines.push([item]);
    } else {
      last.push(item);
    }
  }

  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
  }

  return lines;
}

export function nextOpen(wasOpen, ink) {
  if (wasOpen) return ink >= CLOSE_AT;
  return ink >= OPEN_AT;
}

/** Ink only advances. A later, dimmer sample cannot erase what was already read. */
export function holdInk(previous, next) {
  return Math.max(clamp01(previous), clamp01(next));
}
