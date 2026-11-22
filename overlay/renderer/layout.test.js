import test from "node:test";
import assert from "node:assert/strict";
import { layoutRects } from "./layout.js";

const SIZES = [[1280, 720], [1440, 900], [1470, 956], [1512, 982], [1920, 1080], [1024, 640]];
const inside = (r, vw, vh, m) => r.left >= m - 0.5 && r.top >= m - 0.5 && r.right <= vw - m + 0.5 && r.bottom <= vh - m + 0.5;
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const [vw, vh] of SIZES) {
  test(`cluster fits ${vw}x${vh} with a 24px margin and nothing overlaps`, () => {
    const L = layoutRects(vw, vh);
    assert.ok(L.scale > 0 && L.scale <= 1);
    for (const k of ["left", "right", "ball"]) assert.ok(inside(L[k], vw, vh, 24), `${k} outside at ${vw}x${vh}`);
    assert.ok(!overlap(L.left, L.ball) && !overlap(L.right, L.ball) && !overlap(L.left, L.right));
  });
}

test("design scale is kept on large screens and ≥0.7 on 1280x720", () => {
  assert.equal(layoutRects(1920, 1080).scale, 1);
  assert.ok(layoutRects(1280, 720).scale >= 0.7);
});
