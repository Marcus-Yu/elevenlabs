// Fits the design's cluster (anchor 50%/47%, two 320px columns ±100px from the
// centre, 180px ball) into any viewport with a margin. Pure: viewport in, numbers out.

export const DESIGN = { anchorX: 0.5, anchorY: 0.47, colW: 320, gap: 100, ballR: 90, leftTop: -200, rightTop: -150, margin: 24 };

/** @returns {{scale:number, ax:number, ay:number, leftMax:number, rightMax:number}} max heights in cluster px */
export function computeLayout(vw, vh, d = DESIGN) {
  const ax = vw * d.anchorX;
  const ay = vh * d.anchorY;
  const half = d.gap + d.colW; // 420: centre to a column's outer edge
  const fitW = (Math.min(ax, vw - ax) - d.margin) / half;
  const fitTop = (ay - d.margin) / -d.leftTop; // highest column top must clear the margin
  const fitBall = (vh - ay - d.margin) / (d.ballR + 30); // ball and voice bars below the anchor
  // Ideal is 1 (the design); never larger. Prefer ≥0.7, but shrink further rather than overflow.
  const scale = Math.max(0.3, Math.min(1, fitW, fitTop, fitBall));
  const maxBelow = (top) => (vh - d.margin - (ay + top * scale)) / scale;
  return { scale, ax, ay, leftMax: maxBelow(d.leftTop), rightMax: maxBelow(d.rightTop) };
}

/** Screen rects of the two columns (at their max height) and the ball, for checks. */
export function layoutRects(vw, vh, d = DESIGN) {
  const L = computeLayout(vw, vh, d);
  const s = L.scale;
  const rect = (x, y, w, hh) => ({ left: L.ax + x * s, top: L.ay + y * s, right: L.ax + (x + w) * s, bottom: L.ay + (y + hh) * s });
  return {
    ...L,
    left: rect(-(d.gap + d.colW), d.leftTop, d.colW, L.leftMax),
    right: rect(d.gap, d.rightTop, d.colW, L.rightMax),
    ball: rect(-d.ballR, -d.ballR, d.ballR * 2, d.ballR * 2),
  };
}
