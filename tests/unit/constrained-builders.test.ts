import { describe, expect, it } from "vitest";
import { buildApplyAdjustment, buildApplyFilter } from "../../src/bridge/script-builder.js";

const adjustmentFields = [
  { type: "brightness", field: "brightness", minimum: -100, maximum: 100, outOfRange: -101 },
  { type: "brightness", field: "contrast", minimum: -100, maximum: 100, outOfRange: 101 },
  { type: "hue_sat", field: "hue", minimum: -180, maximum: 180, outOfRange: -181 },
  { type: "hue_sat", field: "saturation", minimum: -100, maximum: 100, outOfRange: 101 },
  { type: "hue_sat", field: "lightness", minimum: -100, maximum: 100, outOfRange: -101 },
  { type: "levels", field: "inputMin", minimum: 0, maximum: 255, outOfRange: -1 },
  { type: "levels", field: "inputMax", minimum: 0, maximum: 255, outOfRange: 256 },
  { type: "levels", field: "gamma", minimum: 0.01, maximum: 9.99, outOfRange: 0 },
  { type: "levels", field: "outputMin", minimum: 0, maximum: 255, outOfRange: -1 },
  { type: "levels", field: "outputMax", minimum: 0, maximum: 255, outOfRange: 256 },
] as const;

const filterFields = [
  { type: "gaussian_blur", field: "radius", minimum: 0, maximum: 250, outOfRange: 251 },
  { type: "unsharp_mask", field: "amount", minimum: 1, maximum: 500, outOfRange: 501 },
  { type: "unsharp_mask", field: "radius", minimum: 0.1, maximum: 250, outOfRange: 0 },
  { type: "unsharp_mask", field: "threshold", minimum: 0, maximum: 255, outOfRange: 256 },
  { type: "noise", field: "amount", minimum: 1, maximum: 100, outOfRange: 0 },
  { type: "motion_blur", field: "angle", minimum: -180, maximum: 180, outOfRange: 181 },
  { type: "motion_blur", field: "distance", minimum: 0, maximum: 1000, outOfRange: 1001 },
] as const;

const injection = "(app.echoToOE('audit'), 2)";

describe("constrained script builders", () => {
  it.each(adjustmentFields.flatMap(({ type, field, outOfRange }) => [
    { type, field, value: injection },
    { type, field, value: Number.NaN },
    { type, field, value: Number.POSITIVE_INFINITY },
    { type, field, value: outOfRange },
  ]))("rejects invalid $type setting $field", ({ type, field, value }) => {
    expect(() => buildApplyAdjustment({ type, settings: { [field]: value } } as never)).toThrow();
  });

  it.each(filterFields.flatMap(({ type, field, outOfRange }) => [
    { type, field, value: injection },
    { type, field, value: Number.NaN },
    { type, field, value: Number.POSITIVE_INFINITY },
    { type, field, value: outOfRange },
  ]))("rejects invalid $type setting $field", ({ type, field, value }) => {
    expect(() => buildApplyFilter({ type, settings: { [field]: value } } as never)).toThrow();
  });

  it.each(adjustmentFields.flatMap(({ type, field, minimum, maximum }) => [
    { type, field, value: minimum },
    { type, field, value: maximum },
  ]))("accepts adjustment boundary $type.$field=$value", ({ type, field, value }) => {
    expect(() => buildApplyAdjustment({ type, settings: { [field]: value } } as never)).not.toThrow();
  });

  it.each(filterFields.flatMap(({ type, field, minimum, maximum }) => [
    { type, field, value: minimum },
    { type, field, value: maximum },
  ]))("accepts filter boundary $type.$field=$value", ({ type, field, value }) => {
    expect(() => buildApplyFilter({ type, settings: { [field]: value } } as never)).not.toThrow();
  });

  it("preserves operation defaults and parses legacy and structured curve points as data", () => {
    expect(buildApplyAdjustment({ type: "brightness" })).toContain("adjustBrightnessContrast(0, 0)");
    expect(buildApplyAdjustment({ type: "hue_sat" })).toContain("adjustColorBalance(0, 0, 0)");
    expect(buildApplyAdjustment({ type: "levels" })).toContain("adjustLevels(0, 255, 1, 0, 255)");
    expect(buildApplyAdjustment({ type: "curves" })).toContain("adjustCurves([[0,0],[255,255]])");
    expect(buildApplyFilter({ type: "gaussian_blur" })).toContain("applyGaussianBlur(2)");
    expect(buildApplyFilter({ type: "sharpen" })).toContain("applySharpen()");
    expect(buildApplyFilter({ type: "unsharp_mask" })).toContain("applyUnSharpMask(50, 1, 0)");
    expect(buildApplyFilter({ type: "noise" })).toContain("applyAddNoise(10)");
    expect(buildApplyFilter({ type: "motion_blur" })).toContain("applyMotionBlur(0, 10)");
    expect(buildApplyAdjustment({
      type: "curves",
      settings: { points: "[[0,0],[128,180],[255,255]]" },
    } as never)).toContain("adjustCurves([[0,0],[128,180],[255,255]])");
    expect(buildApplyAdjustment({
      type: "curves",
      settings: { points: [[0, 0], [255, 255]] },
    } as never)).toContain("adjustCurves([[0,0],[255,255]])");
  });

  it.each([
    { type: "curves", settings: { points: "not-json" } },
    { type: "curves", settings: { points: "[[0,0],[256,255]]" } },
    { type: "curves", settings: { points: [[0, 0], [255, Number.NaN]] } },
    { type: "brightness", settings: { radius: 5 } },
    { type: "unknown", settings: {} },
    { type: "brightness", settings: null },
  ])("rejects malformed or mismatched adjustment input", (input) => {
    expect(() => buildApplyAdjustment(input as never)).toThrow();
  });

  it.each([
    { type: "gaussian_blur", settings: { amount: 5 } },
    { type: "unknown", settings: {} },
    { type: "gaussian_blur", settings: null },
  ])("rejects malformed or mismatched filter input", (input) => {
    expect(() => buildApplyFilter(input as never)).toThrow();
  });
});