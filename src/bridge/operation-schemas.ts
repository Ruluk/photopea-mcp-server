import { z } from "zod";

const boundedNumber = (minimum: number, maximum: number) =>
  z.number().finite().min(minimum).max(maximum);
const emptySettingsSchema = z.object({}).strict();

const brightnessSettingsSchema = z.object({
  brightness: boundedNumber(-100, 100).optional().describe("Brightness (-100 to 100, default 0)"),
  contrast: boundedNumber(-100, 100).optional().describe("Contrast (-100 to 100, default 0)"),
}).strict();

const hueSatSettingsSchema = z.object({
  hue: boundedNumber(-180, 180).optional().describe("Hue (-180 to 180, default 0)"),
  saturation: boundedNumber(-100, 100).optional().describe("Saturation (-100 to 100, default 0)"),
  lightness: boundedNumber(-100, 100).optional().describe("Lightness (-100 to 100, default 0)"),
}).strict();

const levelSettingsSchema = z.object({
  inputMin: boundedNumber(0, 255).optional().describe("Input minimum (0 to 255, default 0)"),
  inputMax: boundedNumber(0, 255).optional().describe("Input maximum (0 to 255, default 255)"),
  gamma: boundedNumber(0.01, 9.99).optional().describe("Gamma (0.01 to 9.99, default 1)"),
  outputMin: boundedNumber(0, 255).optional().describe("Output minimum (0 to 255, default 0)"),
  outputMax: boundedNumber(0, 255).optional().describe("Output maximum (0 to 255, default 255)"),
}).strict();

const curvePointSchema = z.tuple([boundedNumber(0, 255), boundedNumber(0, 255)]);
export const curvePointsSchema = z.array(curvePointSchema).min(2);

const legacyCurvePointsSchema = z.string().refine((value) => {
  try {
    return curvePointsSchema.safeParse(JSON.parse(value)).success;
  } catch {
    return false;
  }
}, "Curve points must be JSON-encoded coordinate pairs between 0 and 255");

const curveSettingsSchema = z.object({
  points: z.union([curvePointsSchema, legacyCurvePointsSchema]).optional(),
}).strict();

const gaussianBlurSettingsSchema = z.object({
  radius: boundedNumber(0, 250).optional().describe("Blur radius in pixels (0 to 250, default 2)"),
}).strict();

const unsharpMaskSettingsSchema = z.object({
  amount: boundedNumber(1, 500).optional().describe("Sharpening amount (1 to 500, default 50)"),
  radius: boundedNumber(0.1, 250).optional().describe("Radius in pixels (0.1 to 250, default 1)"),
  threshold: boundedNumber(0, 255).optional().describe("Threshold (0 to 255, default 0)"),
}).strict();

const noiseSettingsSchema = z.object({
  amount: boundedNumber(1, 100).optional().describe("Noise amount (1 to 100, default 10)"),
}).strict();

const motionBlurSettingsSchema = z.object({
  angle: boundedNumber(-180, 180).optional().describe("Angle in degrees (-180 to 180, default 0)"),
  distance: boundedNumber(0, 1000).optional().describe("Distance in pixels (0 to 1000, default 10)"),
}).strict();

export const applyAdjustmentSettingsSchema = z.union([
  brightnessSettingsSchema,
  hueSatSettingsSchema,
  levelSettingsSchema,
  curveSettingsSchema,
]);

export const applyFilterSettingsSchema = z.union([
  gaussianBlurSettingsSchema,
  unsharpMaskSettingsSchema,
  noiseSettingsSchema,
  motionBlurSettingsSchema,
  emptySettingsSchema,
]);

export const applyAdjustmentParamsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("brightness"), settings: brightnessSettingsSchema.optional() }).strict(),
  z.object({ type: z.literal("hue_sat"), settings: hueSatSettingsSchema.optional() }).strict(),
  z.object({ type: z.literal("levels"), settings: levelSettingsSchema.optional() }).strict(),
  z.object({ type: z.literal("curves"), settings: curveSettingsSchema.optional() }).strict(),
]);

export const applyFilterParamsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("gaussian_blur"), settings: gaussianBlurSettingsSchema.optional() }).strict(),
  z.object({ type: z.literal("sharpen"), settings: emptySettingsSchema.optional() }).strict(),
  z.object({ type: z.literal("unsharp_mask"), settings: unsharpMaskSettingsSchema.optional() }).strict(),
  z.object({ type: z.literal("noise"), settings: noiseSettingsSchema.optional() }).strict(),
  z.object({ type: z.literal("motion_blur"), settings: motionBlurSettingsSchema.optional() }).strict(),
]);

export type ApplyAdjustmentParams = z.infer<typeof applyAdjustmentParamsSchema>;
export type ApplyFilterParams = z.infer<typeof applyFilterParamsSchema>;
export type CurvePoints = z.infer<typeof curvePointsSchema>;

export function parseCurvePoints(points: unknown): CurvePoints {
  return curvePointsSchema.parse(typeof points === "string" ? JSON.parse(points) : points);
}