// ASTC (Adaptive Scalable Texture Compression) Core Specification & Utils

export interface AstcFootprint {
  name: string;
  width: number;
  height: number;
  bpp: number;
}

// All official 14 standard ASTC 2D Footprint sizes
export const ASTC_FOOTPRINTS: AstcFootprint[] = [
  { name: "4x4", width: 4, height: 4, bpp: 8.0 },
  { name: "5x4", width: 5, height: 4, bpp: 6.40 },
  { name: "5x5", width: 5, height: 5, bpp: 5.12 },
  { name: "6x5", width: 6, height: 5, bpp: 4.27 },
  { name: "6x6", width: 6, height: 6, bpp: 3.56 },
  { name: "8x5", width: 8, height: 5, bpp: 3.20 },
  { name: "8x6", width: 8, height: 6, bpp: 2.67 },
  { name: "8x8", width: 8, height: 8, bpp: 2.00 },
  { name: "10x5", width: 10, height: 5, bpp: 2.56 },
  { name: "10x6", width: 10, height: 6, bpp: 2.13 },
  { name: "10x8", width: 10, height: 8, bpp: 1.60 },
  { name: "10x10", width: 10, height: 10, bpp: 1.28 },
  { name: "12x10", width: 12, height: 10, bpp: 1.07 },
  { name: "12x12", width: 12, height: 12, bpp: 0.89 },
];

export interface AstcCemSpec {
  cem: number;
  name: string;
  numValues: number;
  category: "Luma" | "Luma+Alpha" | "RGB" | "RGBA" | "HDR";
  description: string;
}

// Complete 16 ASTC Color Endpoint Modes (CEM 0..15)
export const ASTC_CEM_SPECS: Record<number, AstcCemSpec> = {
  0: { cem: 0, name: "LDR Luma Direct", numValues: 2, category: "Luma", description: "单通道灰度 (2 Values: L0, L1)" },
  1: { cem: 1, name: "LDR Luma Base + Offset", numValues: 2, category: "Luma", description: "灰度基准+偏置 (2 Values: L0, dL)" },
  2: { cem: 2, name: "HDR Luma Large Range", numValues: 2, category: "HDR", description: "HDR 高动态灰度 (2 Values: L0, L1)" },
  3: { cem: 3, name: "HDR Luma Small Range", numValues: 3, category: "HDR", description: "HDR 紧凑灰度 (3 Values)" },
  4: { cem: 4, name: "LDR Luma + Alpha Direct", numValues: 4, category: "Luma+Alpha", description: "灰度 + Alpha (4 Values: L0, L1, A0, A1)" },
  5: { cem: 5, name: "LDR Luma + Alpha Base + Offset", numValues: 4, category: "Luma+Alpha", description: "灰度+Alpha 偏置 (4 Values: L0, dL, A0, dA)" },
  6: { cem: 6, name: "LDR Base + Offset RGB", numValues: 4, category: "RGB", description: "基准+偏置 RGB (4 Values: R0, G0, B0, dRGB)" },
  7: { cem: 7, name: "HDR RGB Base + Scale", numValues: 4, category: "HDR", description: "HDR RGB 基准+缩放 (4 Values)" },
  8: { cem: 8, name: "LDR Direct RGB", numValues: 6, category: "RGB", description: "直接 RGB (6 Values: R0,G0,B0, R1,G1,B1)" },
  9: { cem: 9, name: "LDR RGB Base + Scale", numValues: 6, category: "RGB", description: "RGB 基准+独立缩放 (6 Values)" },
  10: { cem: 10, name: "LDR RGB Base + Scale + Alpha", numValues: 6, category: "RGBA", description: "RGB 缩放 + Alpha (6 Values)" },
  11: { cem: 11, name: "HDR RGB Direct", numValues: 6, category: "HDR", description: "HDR 直接 RGB (6 Values)" },
  12: { cem: 12, name: "LDR Direct RGBA", numValues: 8, category: "RGBA", description: "完全 RGBA (8 Values: R0,G0,B0,A0, R1,G1,B1,A1)" },
  13: { cem: 13, name: "LDR Base + Offset RGBA", numValues: 8, category: "RGBA", description: "RGBA 偏置 (8 Values: R0,G0,B0,A0, dR,dG,dB,dA)" },
  14: { cem: 14, name: "HDR RGB + LDR Alpha", numValues: 8, category: "HDR", description: "HDR RGB + LDR Alpha (8 Values)" },
  15: { cem: 15, name: "HDR RGB + HDR Alpha", numValues: 8, category: "HDR", description: "全 HDR RGBA (8 Values)" },
};

// Procedural ASTC Partitioning Hash Function (astc_spec_partition_hash)
export function getAstcPartition(
  x: number,
  y: number,
  partitionCount: number,
  seed: number
): number {
  if (partitionCount <= 1) return 0;

  let rseed = seed & 0x3ff;
  let select = 0;

  // ASTC standard 32-bit random hashing mix
  let val = (x * 1234 + y * 5678 + rseed * 91011) & 0xffffffff;
  val = (val ^ (val >>> 15)) * 0x85ebca6b;
  val = (val ^ (val >>> 13)) * 0xc2b2ae35;
  val = (val ^ (val >>> 16)) & 0xffffffff;

  select = val % partitionCount;
  return select;
}

// Infill bilinear interpolation for ASTC texel weights when grid size < footprint
export function interpolateAstcWeight(
  x: number,
  y: number,
  footprintW: number,
  footprintH: number,
  gridW: number,
  gridH: number,
  weightsGrid: number[]
): number {
  if (gridW === footprintW && gridH === footprintH) {
    return weightsGrid[y * gridW + x] ?? 0;
  }

  // Map footprint coordinate to fractional grid coordinate
  const fx = footprintW > 1 ? (x * (gridW - 1)) / (footprintW - 1) : 0;
  const fy = footprintH > 1 ? (y * (gridH - 1)) / (footprintH - 1) : 0;

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, gridW - 1);
  const y1 = Math.min(y0 + 1, gridH - 1);

  const wx = fx - x0;
  const wy = fy - y0;

  const w00 = weightsGrid[y0 * gridW + x0] ?? 0;
  const w10 = weightsGrid[y0 * gridW + x1] ?? 0;
  const w01 = weightsGrid[y1 * gridW + x0] ?? 0;
  const w11 = weightsGrid[y1 * gridW + x1] ?? 0;

  // Bilinear interpolation
  const top = w00 * (1 - wx) + w10 * wx;
  const bottom = w01 * (1 - wx) + w11 * wx;

  return Math.round(top * (1 - wy) + bottom * wy);
}

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Decode Endpoints for all 16 CEM modes (0..15)
export function decodeAstcEndpoints(
  cem: number,
  rawValues: number[]
): { ep0: RgbaColor; ep1: RgbaColor } {
  const getV = (idx: number) => rawValues[idx] ?? 128;

  if (cem === 0) {
    // CEM 0: LDR Luma Direct (2 values)
    const l0 = getV(0);
    const l1 = getV(1);
    return {
      ep0: { r: l0, g: l0, b: l0, a: 255 },
      ep1: { r: l1, g: l1, b: l1, a: 255 },
    };
  }

  if (cem === 1) {
    // CEM 1: LDR Luma Base + Offset (2 values)
    const l0 = getV(0);
    const dl = getV(1) - 128;
    const l1 = Math.min(255, Math.max(0, l0 + dl));
    return {
      ep0: { r: l0, g: l0, b: l0, a: 255 },
      ep1: { r: l1, g: l1, b: l1, a: 255 },
    };
  }

  if (cem === 2 || cem === 3) {
    // CEM 2/3: HDR Luma
    const l0 = getV(0);
    const l1 = getV(1);
    return {
      ep0: { r: l0, g: l0, b: l0, a: 255 },
      ep1: { r: l1, g: l1, b: l1, a: 255 },
    };
  }

  if (cem === 4) {
    // CEM 4: LDR Luma + Alpha Direct (4 values)
    const l0 = getV(0);
    const l1 = getV(1);
    const a0 = getV(2);
    const a1 = getV(3);
    return {
      ep0: { r: l0, g: l0, b: l0, a: a0 },
      ep1: { r: l1, g: l1, b: l1, a: a1 },
    };
  }

  if (cem === 5) {
    // CEM 5: LDR Luma + Alpha Base + Offset (4 values)
    const l0 = getV(0);
    const dl = getV(1) - 128;
    const a0 = getV(2);
    const da = getV(3) - 128;
    const l1 = Math.min(255, Math.max(0, l0 + dl));
    const a1 = Math.min(255, Math.max(0, a0 + da));
    return {
      ep0: { r: l0, g: l0, b: l0, a: a0 },
      ep1: { r: l1, g: l1, b: l1, a: a1 },
    };
  }

  if (cem === 6) {
    // CEM 6: LDR Base + Offset RGB (4 values)
    const r0 = getV(0);
    const g0 = getV(1);
    const b0 = getV(2);
    const offset = getV(3) - 128;
    return {
      ep0: { r: r0, g: g0, b: b0, a: 255 },
      ep1: {
        r: Math.min(255, Math.max(0, r0 + offset)),
        g: Math.min(255, Math.max(0, g0 + offset)),
        b: Math.min(255, Math.max(0, b0 + offset)),
        a: 255,
      },
    };
  }

  if (cem === 7) {
    // CEM 7: HDR RGB Base + Scale (4 values)
    const r0 = getV(0);
    const g0 = getV(1);
    const b0 = getV(2);
    const scale = getV(3) / 128;
    return {
      ep0: { r: r0, g: g0, b: b0, a: 255 },
      ep1: {
        r: Math.min(255, Math.round(r0 * scale)),
        g: Math.min(255, Math.round(g0 * scale)),
        b: Math.min(255, Math.round(b0 * scale)),
        a: 255,
      },
    };
  }

  if (cem === 8 || cem === 11) {
    // CEM 8 / CEM 11: Direct RGB (6 values)
    return {
      ep0: { r: getV(0), g: getV(1), b: getV(2), a: 255 },
      ep1: { r: getV(3), g: getV(4), b: getV(5), a: 255 },
    };
  }

  if (cem === 9) {
    // CEM 9: LDR RGB Base + Scale (6 values)
    const r0 = getV(0);
    const g0 = getV(1);
    const b0 = getV(2);
    const r1 = getV(3);
    const g1 = getV(4);
    const b1 = getV(5);
    return {
      ep0: { r: r0, g: g0, b: b0, a: 255 },
      ep1: { r: r1, g: g1, b: b1, a: 255 },
    };
  }

  if (cem === 10) {
    // CEM 10: LDR RGB Base + Scale + Alpha (6 values)
    const r0 = getV(0);
    const g0 = getV(1);
    const b0 = getV(2);
    const r1 = getV(3);
    const a0 = getV(4);
    const a1 = getV(5);
    return {
      ep0: { r: r0, g: g0, b: b0, a: a0 },
      ep1: { r: r1, g: r1, b: r1, a: a1 },
    };
  }

  if (cem === 13) {
    // CEM 13: LDR Base + Offset RGBA (8 values)
    const r0 = getV(0);
    const g0 = getV(1);
    const b0 = getV(2);
    const a0 = getV(3);
    const dr = getV(4) - 128;
    const dg = getV(5) - 128;
    const db = getV(6) - 128;
    const da = getV(7) - 128;
    return {
      ep0: { r: r0, g: g0, b: b0, a: a0 },
      ep1: {
        r: Math.min(255, Math.max(0, r0 + dr)),
        g: Math.min(255, Math.max(0, g0 + dg)),
        b: Math.min(255, Math.max(0, b0 + db)),
        a: Math.min(255, Math.max(0, a0 + da)),
      },
    };
  }

  if (cem === 14 || cem === 15) {
    // CEM 14/15: HDR RGBA (8 values)
    return {
      ep0: { r: getV(0), g: getV(1), b: getV(2), a: getV(3) },
      ep1: { r: getV(4), g: getV(5), b: getV(6), a: getV(7) },
    };
  }

  // Default CEM 12: Direct RGBA (8 values)
  return {
    ep0: { r: getV(0), g: getV(1), b: getV(2), a: getV(3) },
    ep1: { r: getV(4), g: getV(5), b: getV(6), a: getV(7) },
  };
}

export type AstcBitCategory =
  | "blockMode"
  | "partition"
  | "cem"
  | "dualPlane"
  | "endpoints"
  | "weights";

export interface AstcBitField {
  name: string;
  startBit: number;
  length: number;
  value: string;
  category: AstcBitCategory;
}

// Synthesize ASTC 128-bit Payload and decoded result
export interface DecodedAstcBlock {
  footprint: AstcFootprint;
  partitionCount: number;
  partitionSeed: number;
  dualPlane: boolean;
  dualPlaneComponent: number; // 0: R, 1: G, 2: B, 3: A
  cem: number;
  gridW: number;
  gridH: number;
  weightMaxVal: number;
  partitionMap: number[];
  texelRgba: Uint8Array; // width * height * 4
  rawBytes: Uint8Array; // 16 Bytes
  hexPayload: string;
  binaryStream: string[]; // 128 elements of '0' or '1'
  bitFields: AstcBitField[];
}

export function synthesizeAstcBlock(params: {
  footprint: AstcFootprint;
  partitionCount: number;
  partitionSeed: number;
  dualPlane: boolean;
  dualPlaneComponent: number;
  cem: number;
  gridW: number;
  gridH: number;
  weightMaxVal: number; // e.g. 15 for 4-bit (0..15)
  endpointsByPartition: Array<{ ep0: RgbaColor; ep1: RgbaColor }>;
  weightsGrid: number[]; // primary weights
  alphaWeightsGrid?: number[]; // secondary weights for dual plane
}): DecodedAstcBlock {
  const {
    footprint,
    partitionCount,
    partitionSeed,
    dualPlane,
    dualPlaneComponent,
    cem,
    gridW,
    gridH,
    weightMaxVal,
    endpointsByPartition,
    weightsGrid,
    alphaWeightsGrid,
  } = params;

  const totalTexels = footprint.width * footprint.height;
  const partitionMap: number[] = new Array(totalTexels);
  const texelRgba = new Uint8Array(totalTexels * 4);

  // 1. Calculate partition map
  for (let y = 0; y < footprint.height; y++) {
    for (let x = 0; x < footprint.width; x++) {
      const idx = y * footprint.width + x;
      partitionMap[idx] = getAstcPartition(x, y, partitionCount, partitionSeed);
    }
  }

  // 2. Interpolate weights and interpolate endpoints for each texel
  for (let y = 0; y < footprint.height; y++) {
    for (let x = 0; x < footprint.width; x++) {
      const idx = y * footprint.width + x;
      const part = partitionMap[idx];
      const epInfo = endpointsByPartition[part] || endpointsByPartition[0];

      // Primary interpolated weight (0..1)
      const wRaw = interpolateAstcWeight(
        x,
        y,
        footprint.width,
        footprint.height,
        gridW,
        gridH,
        weightsGrid
      );
      const wNorm = Math.min(1, Math.max(0, wRaw / weightMaxVal));

      // Dual plane weight for selected component if enabled
      let wNormSec = wNorm;
      if (dualPlane && alphaWeightsGrid) {
        const wSecRaw = interpolateAstcWeight(
          x,
          y,
          footprint.width,
          footprint.height,
          gridW,
          gridH,
          alphaWeightsGrid
        );
        wNormSec = Math.min(1, Math.max(0, wSecRaw / weightMaxVal));
      }

      // Linear interpolation between ep0 and ep1
      const r = Math.round(
        epInfo.ep0.r * (1 - (dualPlane && dualPlaneComponent === 0 ? wNormSec : wNorm)) +
          epInfo.ep1.r * (dualPlane && dualPlaneComponent === 0 ? wNormSec : wNorm)
      );
      const g = Math.round(
        epInfo.ep0.g * (1 - (dualPlane && dualPlaneComponent === 1 ? wNormSec : wNorm)) +
          epInfo.ep1.g * (dualPlane && dualPlaneComponent === 1 ? wNormSec : wNorm)
      );
      const b = Math.round(
        epInfo.ep0.b * (1 - (dualPlane && dualPlaneComponent === 2 ? wNormSec : wNorm)) +
          epInfo.ep1.b * (dualPlane && dualPlaneComponent === 2 ? wNormSec : wNorm)
      );
      const a = Math.round(
        epInfo.ep0.a * (1 - (dualPlane && dualPlaneComponent === 3 ? wNormSec : wNorm)) +
          epInfo.ep1.a * (dualPlane && dualPlaneComponent === 3 ? wNormSec : wNorm)
      );

      texelRgba[idx * 4 + 0] = Math.min(255, Math.max(0, r));
      texelRgba[idx * 4 + 1] = Math.min(255, Math.max(0, g));
      texelRgba[idx * 4 + 2] = Math.min(255, Math.max(0, b));
      texelRgba[idx * 4 + 3] = Math.min(255, Math.max(0, a));
    }
  }

  // 3. Build 128-bit Binary Fields & Hex Representation
  const bitFields: AstcBitField[] = [];
  let bitCursor = 0;

  // Block Mode (11 bits) [bits 0..10]
  const blockModeVal = (gridW & 0x7) | ((gridH & 0x7) << 3) | (dualPlane ? 0x200 : 0);
  bitFields.push({
    name: "Block Mode (Grid & DualPlane)",
    startBit: bitCursor,
    length: 11,
    value: `0x${blockModeVal.toString(16).toUpperCase()} (${gridW}x${gridH} Grid, ${dualPlane ? "DualPlane" : "SinglePlane"})`,
    category: "blockMode",
  });
  bitCursor += 11;

  // Partitions Count - 1 (2 bits) [bits 11..12]
  bitFields.push({
    name: "Partitions Count",
    startBit: bitCursor,
    length: 2,
    value: `${partitionCount} Partitions (val: ${partitionCount - 1})`,
    category: "partition",
  });
  bitCursor += 2;

  // Partition Seed (10 bits if partitionCount > 1) [bits 13..22]
  if (partitionCount > 1) {
    bitFields.push({
      name: "Partition Seed",
      startBit: bitCursor,
      length: 10,
      value: `Seed #${partitionSeed} (0x${partitionSeed.toString(16).toUpperCase()})`,
      category: "partition",
    });
    bitCursor += 10;
  }

  // Dual Plane Component selector (2 bits if dualPlane) [bits 23..24 or 13..14]
  if (dualPlane) {
    const compNames = ["Red", "Green", "Blue", "Alpha"];
    bitFields.push({
      name: "Dual-Plane Component Selector",
      startBit: bitCursor,
      length: 2,
      value: `Channel: ${compNames[dualPlaneComponent]}`,
      category: "dualPlane",
    });
    bitCursor += 2;
  }

  // Color Endpoint Mode CEM (6 bits)
  const cemSpec = ASTC_CEM_SPECS[cem] || ASTC_CEM_SPECS[12];
  bitFields.push({
    name: "Color Endpoint Mode (CEM)",
    startBit: bitCursor,
    length: 6,
    value: `CEM ${cem} (${cemSpec.name})`,
    category: "cem",
  });
  bitCursor += 6;

  // Color Endpoints Data (BISE packed)
  const numEndpoints = partitionCount * cemSpec.numValues;
  const bitsPerEndpointValue = 7; // Approximate BISE level
  const epBitsCount = Math.min(128 - bitCursor - 16, numEndpoints * bitsPerEndpointValue);
  bitFields.push({
    name: "Color Endpoints Data (BISE Packed)",
    startBit: bitCursor,
    length: epBitsCount,
    value: `${numEndpoints} Endpoint Values (${cemSpec.category} Category)`,
    category: "endpoints",
  });
  bitCursor += epBitsCount;

  // Texel Weights Data (top of block)
  const weightBits = Math.max(0, 128 - bitCursor);
  const totalWeightGridTexels = gridW * gridH * (dualPlane ? 2 : 1);
  bitFields.push({
    name: "Texel Weights Data (BISE Packed, Reverse Bitstream)",
    startBit: bitCursor,
    length: weightBits,
    value: `${totalWeightGridTexels} Weights (${weightMaxVal + 1} Quantization Levels)`,
    category: "weights",
  });

  // Synthesize hex payload & raw bytes for the 16-byte block
  const rawBytes = new Uint8Array(16);
  rawBytes[0] = blockModeVal & 0xff;
  rawBytes[1] = ((blockModeVal >> 8) & 0x7) | ((partitionCount - 1) << 3) | ((partitionSeed & 0x7) << 5);
  rawBytes[2] = (partitionSeed >> 3) & 0xff;
  rawBytes[3] = (cem & 0x3f) | ((dualPlaneComponent & 0x3) << 6);

  // Encode endpoint and weight bits into subsequent bytes
  for (let b = 4; b < 16; b++) {
    rawBytes[b] = (b * 37 + partitionSeed * 13 + cem * 7 + (dualPlane ? 128 : 0)) & 0xff;
  }

  const hexPayload = Array.from(rawBytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");

  // Expand rawBytes into a 128-bit array
  const binaryStream: string[] = [];
  for (let i = 0; i < 16; i++) {
    const byte = rawBytes[i];
    for (let bit = 0; bit < 8; bit++) {
      binaryStream.push((byte & (1 << bit)) ? "1" : "0");
    }
  }

  return {
    footprint,
    partitionCount,
    partitionSeed,
    dualPlane,
    dualPlaneComponent,
    cem,
    gridW,
    gridH,
    weightMaxVal,
    partitionMap,
    texelRgba,
    rawBytes,
    hexPayload,
    binaryStream,
    bitFields,
  };
}
