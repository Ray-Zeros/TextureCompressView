/**
 * Fast Real-Time BC7 Block Encoder
 */

import {
  BC7_MODE_SPECS,
  BC7_PARTITIONS_2_SUBSET,
  BC7_PARTITIONS_3_SUBSET,
  BC7_WEIGHTS_2BIT,
  BC7_WEIGHTS_3BIT,
  BC7_WEIGHTS_4BIT,
  getAnchorTexels,
} from "./bc7Tables";
import { decodeBC7Block } from "./bc7Decoder";

export interface EncodeOptions {
  allowedModes?: number[]; // e.g. [0, 1, 2, 3, 4, 5, 6, 7]
  quality?: "fast" | "balanced" | "best"; // Partition search depth
}

/**
 * Bit Stream Writer helper class for writing 128-bit buffers (16 bytes)
 */
export class BitStreamWriter {
  public bytes = new Uint8Array(16);
  public offset = 0;

  writeBits(val: number, numBits: number) {
    if (numBits === 0) return;
    for (let i = 0; i < numBits; i++) {
      const bit = (val >> i) & 1;
      const bitPos = this.offset + i;
      const byteIdx = Math.floor(bitPos / 8);
      const bitInByte = bitPos % 8;
      if (byteIdx < 16) {
        this.bytes[byteIdx] |= bit << bitInByte;
      }
    }
    this.offset += numBits;
  }
}

/**
 * Quantizes an 8-bit component (0..255) down to `bits` with optional P-bit
 */
export function quantizeComponent(val: number, targetBits: number, usePbit: boolean): { quantized: number; pbit: number } {
  if (targetBits === 8) {
    return { quantized: val, pbit: 0 };
  }
  if (usePbit) {
    // totalBits = targetBits + 1
    const totalBits = targetBits + 1;
    const shift = 8 - totalBits;
    const v = Math.min((1 << totalBits) - 1, Math.round(val >> shift));
    const pbit = v & 1;
    const quantized = v >> 1;
    return { quantized, pbit };
  } else {
    const shift = 8 - targetBits;
    const quantized = Math.min((1 << targetBits) - 1, Math.round(val >> shift));
    return { quantized, pbit: 0 };
  }
}

/**
 * Calculates MSE between original 16 RGBA texels and decoded 16 RGBA texels
 */
export function calculateBlockMSE(orig: Uint8Array | Uint8ClampedArray, decoded: Uint8Array | Uint8ClampedArray): number {
  let mse = 0;
  for (let i = 0; i < 64; i += 4) {
    const dr = orig[i] - decoded[i];
    const dg = orig[i + 1] - decoded[i + 1];
    const db = orig[i + 2] - decoded[i + 2];
    const da = orig[i + 3] - decoded[i + 3];
    mse += dr * dr + dg * dg + db * db + da * da;
  }
  return mse / 16;
}

/**
 * Encodes a 4x4 RGBA texel array (64 bytes) into a 16-byte BC7 payload
 */
export function encodeBC7Block(texelsRGBA: Uint8Array | Uint8ClampedArray, options: EncodeOptions = {}): Uint8Array {
  const allowedModes = options.allowedModes || [6, 1, 7, 3, 5, 4, 0, 2];
  const quality = options.quality || "balanced";

  let bestMSE = Infinity;
  let bestPayload = new Uint8Array(16);

  // Quick check for Mode 6 (Single Subset 4-bit indices 8-bit RGBA)
  if (allowedModes.includes(6)) {
    const payload = encodeMode6(texelsRGBA);
    const mse = evaluatePayloadMSE(texelsRGBA, payload);
    if (mse < bestMSE) {
      bestMSE = mse;
      bestPayload = payload;
    }
  }

  // Check Mode 1 (2 Subsets RGB)
  if (allowedModes.includes(1) && bestMSE > 5) {
    const maxPartitions = quality === "fast" ? 8 : quality === "balanced" ? 24 : 64;
    for (let p = 0; p < maxPartitions; p++) {
      const payload = encodeMode1(texelsRGBA, p);
      const mse = evaluatePayloadMSE(texelsRGBA, payload);
      if (mse < bestMSE) {
        bestMSE = mse;
        bestPayload = payload;
        if (bestMSE === 0) break;
      }
    }
  }

  // Check Mode 7 (2 Subsets RGBA)
  if (allowedModes.includes(7) && bestMSE > 5) {
    const maxPartitions = quality === "fast" ? 8 : quality === "balanced" ? 24 : 64;
    for (let p = 0; p < maxPartitions; p++) {
      const payload = encodeMode7(texelsRGBA, p);
      const mse = evaluatePayloadMSE(texelsRGBA, payload);
      if (mse < bestMSE) {
        bestMSE = mse;
        bestPayload = payload;
        if (bestMSE === 0) break;
      }
    }
  }

  return bestPayload;
}

function evaluatePayloadMSE(texelsRGBA: Uint8Array | Uint8ClampedArray, payload: Uint8Array): number {
  const decoded = decodeBC7Block(payload);
  return calculateBlockMSE(texelsRGBA, decoded.rgbaTexels);
}

/**
 * Mode 6 Encoder: 1 Subset, RGBA 7-bit + P-bit (8-bit), 4-bit index (16 weights)
 */
function encodeMode6(texels: Uint8Array | Uint8ClampedArray): Uint8Array {
  const writer = new BitStreamWriter();

  // Mode 6 prefix: 0b01000000 (0 followed by 1 at bit 6) -> 6 zeros then a 1
  writer.writeBits(0, 6);
  writer.writeBits(1, 1); // bit 6 = 1 -> Mode 6

  // Find Min and Max RGBA in block
  let minR = 255, maxR = 0;
  let minG = 255, maxG = 0;
  let minB = 255, maxB = 0;
  let minA = 255, maxA = 0;

  for (let i = 0; i < 64; i += 4) {
    minR = Math.min(minR, texels[i]); maxR = Math.max(maxR, texels[i]);
    minG = Math.min(minG, texels[i + 1]); maxG = Math.max(maxG, texels[i + 1]);
    minB = Math.min(minB, texels[i + 2]); maxB = Math.max(maxB, texels[i + 2]);
    minA = Math.min(minA, texels[i + 3]); maxA = Math.max(maxA, texels[i + 3]);
  }

  // Endpoint 0 = min, Endpoint 1 = max
  const qEp0R = quantizeComponent(minR, 7, true);
  const qEp1R = quantizeComponent(maxR, 7, true);
  const qEp0G = quantizeComponent(minG, 7, true);
  const qEp1G = quantizeComponent(maxG, 7, true);
  const qEp0B = quantizeComponent(minB, 7, true);
  const qEp1B = quantizeComponent(maxB, 7, true);
  const qEp0A = quantizeComponent(minA, 7, true);
  const qEp1A = quantizeComponent(maxA, 7, true);

  // Write Endpoints: R0, R1, G0, G1, B0, B1, A0, A1
  writer.writeBits(qEp0R.quantized, 7); writer.writeBits(qEp1R.quantized, 7);
  writer.writeBits(qEp0G.quantized, 7); writer.writeBits(qEp1G.quantized, 7);
  writer.writeBits(qEp0B.quantized, 7); writer.writeBits(qEp1B.quantized, 7);
  writer.writeBits(qEp0A.quantized, 7); writer.writeBits(qEp1A.quantized, 7);

  // Write P-bits: P0, P1
  writer.writeBits(qEp0R.pbit, 1);
  writer.writeBits(qEp1R.pbit, 1);

  // Write 4-bit indices for 16 texels (anchor texel 0 omits MSB, so 3 bits for texel 0)
  const weights4 = BC7_WEIGHTS_4BIT; // [0, 4, 9, ..., 64]
  for (let i = 0; i < 16; i++) {
    const r = texels[i * 4];
    const g = texels[i * 4 + 1];
    const b = texels[i * 4 + 2];
    const a = texels[i * 4 + 3];

    // Project onto ep0..ep1 line segment
    const spanSq = Math.max(1, (maxR - minR) ** 2 + (maxG - minG) ** 2 + (maxB - minB) ** 2 + (maxA - minA) ** 2);
    const dot = (r - minR) * (maxR - minR) + (g - minG) * (maxG - minG) + (b - minB) * (maxB - minB) + (a - minA) * (maxA - minA);
    const t = Math.min(1, Math.max(0, dot / spanSq));
    const targetWeight = Math.round(t * 64);

    // Find closest index in weights4
    let bestIdx = 0;
    let minDiff = 999;
    for (let w = 0; w < 16; w++) {
      const diff = Math.abs(weights4[w] - targetWeight);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = w;
      }
    }

    if (i === 0) {
      // Anchor texel: write 3 bits (MSB implicit 0)
      writer.writeBits(bestIdx & 7, 3);
    } else {
      writer.writeBits(bestIdx, 4);
    }
  }

  return writer.bytes;
}

/**
 * Mode 1 Encoder: 2 Subsets, RGB 6-bit + shared P-bit, 3-bit index
 */
function encodeMode1(texels: Uint8Array | Uint8ClampedArray, partitionIdx: number): Uint8Array {
  const writer = new BitStreamWriter();

  // Mode 1 prefix: 0b00000010 (bit 1 = 1)
  writer.writeBits(0, 1);
  writer.writeBits(1, 1); // bit 1 = 1 -> Mode 1

  // Write Partition (6 bits)
  writer.writeBits(partitionIdx & 63, 6);

  const partition = BC7_PARTITIONS_2_SUBSET[partitionIdx % 64];

  // Calculate bounding boxes for subset 0 and subset 1
  const sub0R: number[] = [], sub0G: number[] = [], sub0B: number[] = [];
  const sub1R: number[] = [], sub1G: number[] = [], sub1B: number[] = [];

  for (let i = 0; i < 16; i++) {
    if (partition[i] === 0) {
      sub0R.push(texels[i * 4]); sub0G.push(texels[i * 4 + 1]); sub0B.push(texels[i * 4 + 2]);
    } else {
      sub1R.push(texels[i * 4]); sub1G.push(texels[i * 4 + 1]); sub1B.push(texels[i * 4 + 2]);
    }
  }

  const ep0R_min = sub0R.length ? Math.min(...sub0R) : 0, ep0R_max = sub0R.length ? Math.max(...sub0R) : 0;
  const ep0G_min = sub0G.length ? Math.min(...sub0G) : 0, ep0G_max = sub0G.length ? Math.max(...sub0G) : 0;
  const ep0B_min = sub0B.length ? Math.min(...sub0B) : 0, ep0B_max = sub0B.length ? Math.max(...sub0B) : 0;

  const ep1R_min = sub1R.length ? Math.min(...sub1R) : 0, ep1R_max = sub1R.length ? Math.max(...sub1R) : 0;
  const ep1G_min = sub1G.length ? Math.min(...sub1G) : 0, ep1G_max = sub1G.length ? Math.max(...sub1G) : 0;
  const ep1B_min = sub1B.length ? Math.min(...sub1B) : 0, ep1B_max = sub1B.length ? Math.max(...sub1B) : 0;

  // Quantize 6 bits
  const q0_0 = quantizeComponent(ep0R_min, 6, false); const q0_1 = quantizeComponent(ep0R_max, 6, false);
  const q0_2 = quantizeComponent(ep0G_min, 6, false); const q0_3 = quantizeComponent(ep0G_max, 6, false);
  const q0_4 = quantizeComponent(ep0B_min, 6, false); const q0_5 = quantizeComponent(ep0B_max, 6, false);

  const q1_0 = quantizeComponent(ep1R_min, 6, false); const q1_1 = quantizeComponent(ep1R_max, 6, false);
  const q1_2 = quantizeComponent(ep1G_min, 6, false); const q1_3 = quantizeComponent(ep1G_max, 6, false);
  const q1_4 = quantizeComponent(ep1B_min, 6, false); const q1_5 = quantizeComponent(ep1B_max, 6, false);

  // Write Endpoints (4 endpoints: ep0_sub0, ep1_sub0, ep0_sub1, ep1_sub1)
  writer.writeBits(q0_0.quantized, 6); writer.writeBits(q0_1.quantized, 6);
  writer.writeBits(q1_0.quantized, 6); writer.writeBits(q1_1.quantized, 6);

  writer.writeBits(q0_2.quantized, 6); writer.writeBits(q0_3.quantized, 6);
  writer.writeBits(q1_2.quantized, 6); writer.writeBits(q1_3.quantized, 6);

  writer.writeBits(q0_4.quantized, 6); writer.writeBits(q0_5.quantized, 6);
  writer.writeBits(q1_4.quantized, 6); writer.writeBits(q1_5.quantized, 6);

  // Write P-bits (1 per subset)
  writer.writeBits(0, 1); // P-bit subset 0
  writer.writeBits(0, 1); // P-bit subset 1

  // Write 3-bit indices for 16 texels
  const anchorTexels = getAnchorTexels(partition, 2);
  const weights3 = BC7_WEIGHTS_3BIT;

  for (let i = 0; i < 16; i++) {
    const isAnchor = anchorTexels.includes(i);
    const sub = partition[i];
    const minR = sub === 0 ? ep0R_min : ep1R_min;
    const maxR = sub === 0 ? ep0R_max : ep1R_max;

    const r = texels[i * 4];
    const span = Math.max(1, maxR - minR);
    const t = Math.min(1, Math.max(0, (r - minR) / span));
    const targetWeight = Math.round(t * 64);

    let bestIdx = 0;
    let minDiff = 999;
    for (let w = 0; w < 8; w++) {
      const diff = Math.abs(weights3[w] - targetWeight);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = w;
      }
    }

    if (isAnchor) {
      writer.writeBits(bestIdx & 3, 2);
    } else {
      writer.writeBits(bestIdx, 3);
    }
  }

  return writer.bytes;
}

/**
 * Mode 7 Encoder: 2 Subsets, RGBA 5-bit + P-bit, 2-bit index
 */
function encodeMode7(texels: Uint8Array | Uint8ClampedArray, partitionIdx: number): Uint8Array {
  const writer = new BitStreamWriter();

  // Mode 7 prefix: 0b10000000 (bit 7 = 1)
  writer.writeBits(0, 7);
  writer.writeBits(1, 1);

  // Write Partition (6 bits)
  writer.writeBits(partitionIdx & 63, 6);

  const partition = BC7_PARTITIONS_2_SUBSET[partitionIdx % 64];

  // Simplified bounding box
  for (let channel = 0; channel < 4; channel++) {
    for (let e = 0; e < 4; e++) {
      writer.writeBits(16, 5); // Default midpoint 16/31
    }
  }

  // 4 P-bits
  writer.writeBits(0, 4);

  // 16 2-bit texel indices
  const anchorTexels = getAnchorTexels(partition, 2);
  for (let i = 0; i < 16; i++) {
    const isAnchor = anchorTexels.includes(i);
    writer.writeBits(1, isAnchor ? 1 : 2);
  }

  return writer.bytes;
}
