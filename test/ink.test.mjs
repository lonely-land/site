import assert from "node:assert/strict";
import test from "node:test";
import { charInk, groupLines, holdInk, lineProgress, nextOpen } from "../lib/ink.mjs";

test("characters fill left to right", () => {
  const count = 8;
  const early = Array.from({ length: count }, (_, index) =>
    charInk(0.2, index, count),
  );
  assert.ok(early[0] > early[1]);
  assert.ok(early[1] > early[2]);
  assert.equal(early[7], 0);

  const done = Array.from({ length: count }, (_, index) =>
    charInk(1, index, count),
  );
  assert.ok(done.every((ink) => ink === 1));

  const fresh = Array.from({ length: count }, (_, index) =>
    charInk(0, index, count),
  );
  assert.ok(fresh.every((ink) => ink === 0));
});

test("a line finishes before the next line starts, so the edge stays horizontal", () => {
  const vh = 800;
  const step = 48;
  assert.equal(lineProgress(448, vh, step), 0);
  assert.equal(lineProgress(400, vh, step), 1);
  assert.equal(lineProgress(352, vh, step), 1);
  assert.equal(lineProgress(496, vh, step), 0);

  const mid = lineProgress(424, vh, step);
  assert.ok(mid > 0 && mid < 1);
  assert.equal(lineProgress(424 + step, vh, step), 0);
  assert.equal(lineProgress(424 - step, vh, step), 1);
});

test("lines group by vertical position, then read left to right", () => {
  const lines = groupLines(
    [
      { id: "b", x: 40, y: 20 },
      { id: "a", x: 10, y: 20 },
      { id: "c", x: 8, y: 80 },
    ],
    8,
  );
  assert.deepEqual(
    lines.map((line) => line.map((item) => item.id)),
    [["a", "b"], ["c"]],
  );
});

test("ink that has already been read does not recede", () => {
  assert.equal(holdInk(0.8, 0.2), 0.8);
  assert.equal(holdInk(0.2, 0.8), 0.8);
  assert.equal(holdInk(0, 0), 0);
  assert.equal(holdInk(1, 0.4), 1);
});

test("cards open as the word is reached and stay open until it falls back into the dim band", () => {
  assert.equal(nextOpen(false, 0.2), false);
  assert.equal(nextOpen(false, 0.4), true);
  assert.equal(nextOpen(true, 0.2), true);
  assert.equal(nextOpen(true, 0.02), false);
});
