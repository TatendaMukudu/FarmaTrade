import { describe, expect, it } from "vitest";
import { detectImageFormat } from "./image-validation";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

// Real headers, padded out so length checks behave as they would on a file.
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d);
const GIF89 = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00);
const GIF87 = bytes(0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);

describe("detectImageFormat", () => {
  it("identifies the four accepted raster formats", () => {
    expect(detectImageFormat(JPEG)).toBe("image/jpeg");
    expect(detectImageFormat(PNG)).toBe("image/png");
    expect(detectImageFormat(GIF89)).toBe("image/gif");
    expect(detectImageFormat(GIF87)).toBe("image/gif");
    expect(detectImageFormat(WEBP)).toBe("image/webp");
  });

  it("rejects SVG — the payload this whole file exists to stop", () => {
    // `<svg xmlns=...><script>` — passes `type.startsWith("image/")` when
    // the browser is told to call it image/svg+xml, and executes as script
    // if it's ever served back under that content type.
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>',
    );
    expect(detectImageFormat(svg)).toBeNull();
  });

  it("rejects an SVG that opens with an XML declaration or a comment", () => {
    for (const payload of [
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>',
      '<!-- pad --><svg xmlns="http://www.w3.org/2000/svg"/>',
      '  \n\t<svg xmlns="http://www.w3.org/2000/svg"/>',
    ]) {
      expect(detectImageFormat(new TextEncoder().encode(payload))).toBeNull();
    }
  });

  it("rejects HTML, scripts and executables regardless of what they're called", () => {
    expect(detectImageFormat(new TextEncoder().encode("<!DOCTYPE html><html>"))).toBeNull();
    expect(detectImageFormat(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    // ELF and Windows PE headers.
    expect(detectImageFormat(bytes(0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0, 0, 0, 0, 0))).toBeNull();
    expect(detectImageFormat(bytes(0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0))).toBeNull();
  });

  it("rejects a polyglot that only looks like RIFF", () => {
    // "RIFF" followed by something that isn't WEBP — e.g. a WAV file, or a
    // crafted container hoping a prefix check is all that's happening.
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45);
    expect(detectImageFormat(wav)).toBeNull();
  });

  it("rejects truncated headers rather than reading past the end", () => {
    expect(detectImageFormat(bytes())).toBeNull();
    expect(detectImageFormat(bytes(0xff, 0xd8))).toBeNull();
    expect(detectImageFormat(bytes(0x52, 0x49, 0x46, 0x46, 0x24))).toBeNull();
  });

  it("does not accept a real image with a corrupted first byte", () => {
    const corrupted = new Uint8Array(PNG);
    corrupted[0] = 0x00;
    expect(detectImageFormat(corrupted)).toBeNull();
  });
});
