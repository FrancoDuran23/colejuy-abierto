export const INK = "#33312c";

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

// The source paints every line in a loud color of its own lightness, so some shout and some sink.
// Each line keeps its hue, and all of them share one lightness and one lively saturation:
// bright enough to be cheerful, even enough that none of them screams.
const TONE_LIGHTNESS = 0.7;
const TONE_CHROMA = 0.15;

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

const tones = new Map<string, string>();

export function tone(hex: string | null | undefined): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return INK;
  const cached = tones.get(hex);
  if (cached) return cached;
  const n = parseInt(hex.slice(1), 16);
  const r = toLinear(((n >> 16) & 255) / 255);
  const g = toLinear(((n >> 8) & 255) / 255);
  const b = toLinear((n & 255) / 255);
  // sRGB to OKLab, to read the hue.
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const hue = Math.atan2(0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s);
  // Same hue, fixed lightness and chroma, back to sRGB.
  const A = TONE_CHROMA * Math.cos(hue);
  const B = TONE_CHROMA * Math.sin(hue);
  const l2 = (TONE_LIGHTNESS + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m2 = (TONE_LIGHTNESS - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s2 = (TONE_LIGHTNESS - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const channel = (v: number) => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255);
  const out =
    "#" +
    [4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2, -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2, -0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2]
      .map((v) => channel(v).toString(16).padStart(2, "0"))
      .join("");
  tones.set(hex, out);
  return out;
}

// Black or white, whichever reads better on the line's color.
export function textOn(hex: string) {
  const l = luminance(/^#[0-9a-f]{6}$/i.test(hex) ? hex : INK);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#ffffff" : "#000000";
}
