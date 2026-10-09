import { describe, expect, it } from "vitest";
import { INK, textOn, tone } from "./color";

// The colors Santa Ana sends for its 39 lines.
const SOURCE = ["#0B6E4F", "#0E7490", "#2563EB", "#7C3AED", "#C026D3", "#DC2626", "#EA580C", "#CA8A04", "#65A30D", "#16A34A", "#059669", "#0891B2", "#0284C7", "#4F46E5", "#9333EA", "#BE185D", "#E11D48", "#EF4444", "#F97316", "#D97706", "#84CC16", "#22C55E", "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#B91C1C", "#92400E", "#A16207", "#4D7C0F", "#F57C00", "#15803D", "#1E3A8A"];

const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// How colourful: the spread between the strongest and the weakest channel.
const spread = (hex: string) => Math.max(...channels(hex)) - Math.min(...channels(hex));

describe("tone", () => {
  it("returns a valid color for every line", () => {
    for (const hex of SOURCE) expect(tone(hex)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("carries its text with at least 4.5:1 contrast on every line", () => {
    for (const hex of SOURCE) {
      const toned = tone(hex);
      const text = luminance(textOn(toned));
      const ground = luminance(toned);
      expect((Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses the same text color on every line, so no plate looks like the odd one out", () => {
    expect(new Set(SOURCE.map((hex) => textOn(tone(hex)))).size).toBe(1);
  });

  it("gives every line a similar lightness, unlike the source", () => {
    const range = (colors: string[]) => Math.max(...colors.map(luminance)) / Math.min(...colors.map(luminance));
    expect(range(SOURCE.map(tone))).toBeLessThan(2);
    expect(range(SOURCE)).toBeGreaterThan(4);
  });

  it("stays colorful", () => {
    for (const hex of SOURCE) expect(spread(tone(hex))).toBeGreaterThan(70);
  });

  it("keeps lines of different hue apart", () => {
    expect(new Set(SOURCE.map(tone)).size).toBeGreaterThanOrEqual(30);
    expect(tone("#DC2626")).not.toBe(tone("#16A34A"));
  });

  it("falls back to ink without a usable color", () => {
    expect(tone(null)).toBe(INK);
    expect(tone("verde")).toBe(INK);
  });
});
