/**
 * BC7 Block Decoder and Bit Stream Inspector
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

export interface BitField {
  name: string;
  category: "mode" | "partition" | "endpoint" | "pbit" | "rotation" | "idxmode" | "indices";
  startBit: number;
  length: number;
  value: number;
  description: string;
  subsetIndex?: number;
  endpointIndex?: number;
  channel?: "r" | "g" | "b" | "a";
}

export interface DecodedBC7Block {
  mode: number;
  partition: number;
  numSubsets: number;
  rotation: number;
  indexMode: number;
  endpoints: Array<{ r: number; g: number; b: number; a: number }>; // Unquantized 8-bit endpoints
  pBits: number[];
  partitionPattern: number[];
  texelWeights: number[];
  rgbaTexels: Uint8ClampedArray; // 16 * 4 RGBA array (64 bytes)
  bitMap: BitField[];
  hexPayload: string;
  binaryStream: string;
}

/**
 * Bit Stream Helper class for 128-bit buffers (16 bytes, little-endian bit order)
 */
export class BitStreamReader {
  private bytes: Uint8Array;
  public offset: number = 0;

  constructor(bytes: Uint8Array) {
    if (bytes.length < 16) {
      const padded = new Uint8Array(16);
      padded.set(bytes);
      this.bytes = padded;
    } else {
      this.bytes = bytes.subarray(0, 16);
    }
  }

  readBits(numBits: number): number {
    if (numBits === 0) return 0;
    let value = 0;
    for (let i = 0; i < numBits; i++) {
      const bitPos = this.offset + i;
      const byteIdx = Math.floor(bitPos / 8);
      const bitInByte = bitPos % 8;
      const bit = (this.bytes[byteIdx] >> bitInByte) & 1;
      value |= bit << i;
    }
    this.offset += numBits;
    return value;
  }
}

/**
 * Unquantizes a quantized color component value to full 8-bit (0..255)
 */
export function unquantizeComponent(val: number, bits: number, pBit?: number): number {
  if (bits === 8) return val;
  let totalBits = bits;
  let extendedVal = val;
  if (pBit !== undefined) {
    extendedVal = (val << 1) | pBit;
    totalBits = bits + 1;
  }
  if (totalBits === 8) return extendedVal;
  // Bit replication to expand totalBits to 8 bits
  const shift = 8 - totalBits;
  return (extendedVal << shift) | (extendedVal >> (2 * totalBits - 8));
}

/**
 * Decodes a 16-byte BC7 block buffer into texel colors and bit breakdown
 */
export function decodeBC7Block(blockBytes: Uint8Array): DecodedBC7Block {
  const reader = new BitStreamReader(blockBytes);
  const bitMap: BitField[] = [];

  // 1. Read Mode Bits (Mode 0: 1, Mode 1: 01, Mode 2: 001, ..., Mode 7: 00000001)
  let mode = -1;
  let modeBitLength = 0;
  for (let i = 0; i < 8; i++) {
    const bit = reader.readBits(1);
    modeBitLength++;
    if (bit === 1) {
      mode = i;
      break;
    }
  }

  if (mode === -1 || mode > 7) {
    mode = 6; // Fallback default
  }

  bitMap.push({
    name: `Mode ${mode}`,
    category: "mode",
    startBit: 0,
    length: modeBitLength,
    value: mode,
    description: `BC7 Mode ${mode} identifier bits`,
  });

  const spec = BC7_MODE_SPECS[mode];
  const numSubsets = spec.subsets;

  // 2. Read Partition Index
  let partition = 0;
  if (spec.partitionBits > 0) {
    const startBit = reader.offset;
    partition = reader.readBits(spec.partitionBits);
    bitMap.push({
      name: "Partition Index",
      category: "partition",
      startBit,
      length: spec.partitionBits,
      value: partition,
      description: `Selects partition shape #${partition} for ${numSubsets} subsets`,
    });
  }

  // Determine partition shape array
  let partitionPattern: number[] = new Array(16).fill(0);
  if (numSubsets === 2) {
    partitionPattern = BC7_PARTITIONS_2_SUBSET[partition % 64] || new Array(16).fill(0);
  } else if (numSubsets === 3) {
    partitionPattern = BC7_PARTITIONS_3_SUBSET[partition % 64] || new Array(16).fill(0);
  }

  // 3. Read Rotation bits (Mode 4 and Mode 5)
  let rotation = 0;
  if (spec.rotationBits > 0) {
    const startBit = reader.offset;
    rotation = reader.readBits(spec.rotationBits);
    bitMap.push({
      name: "Rotation Bits",
      category: "rotation",
      startBit,
      length: spec.rotationBits,
      value: rotation,
      description: `Channel rotation: ${
        rotation === 1 ? "R/A Swap" : rotation === 2 ? "G/A Swap" : rotation === 3 ? "B/A Swap" : "None"
      }`,
    });
  }

  // 4. Read Index Mode selection bit (Mode 4)
  let indexMode = 0;
  if (spec.indexSelectionBits > 0) {
    const startBit = reader.offset;
    indexMode = reader.readBits(spec.indexSelectionBits);
    bitMap.push({
      name: "Index Mode",
      category: "idxmode",
      startBit,
      length: spec.indexSelectionBits,
      value: indexMode,
      description: `Determines index bit allocation (${indexMode === 0 ? "RGB 2-bit, A 3-bit" : "RGB 3-bit, A 2-bit"})`,
    });
  }

  // 5. Read Endpoint Quantized Component Bits
  const numEndpoints = numSubsets * 2;
  const rawEndpointsR: number[] = [];
  const rawEndpointsG: number[] = [];
  const rawEndpointsB: number[] = [];
  const rawEndpointsA: number[] = [];

  // Read Red components
  for (let e = 0; e < numEndpoints; e++) {
    const startBit = reader.offset;
    const r = reader.readBits(spec.colorBits);
    rawEndpointsR.push(r);
    bitMap.push({
      name: `R ep${e}`,
      category: "endpoint",
      channel: "r",
      startBit,
      length: spec.colorBits,
      value: r,
      endpointIndex: e,
      description: `Red component for endpoint ${e}`,
    });
  }

  // Read Green components
  for (let e = 0; e < numEndpoints; e++) {
    const startBit = reader.offset;
    const g = reader.readBits(spec.colorBits);
    rawEndpointsG.push(g);
    bitMap.push({
      name: `G ep${e}`,
      category: "endpoint",
      channel: "g",
      startBit,
      length: spec.colorBits,
      value: g,
      endpointIndex: e,
      description: `Green component for endpoint ${e}`,
    });
  }

  // Read Blue components
  for (let e = 0; e < numEndpoints; e++) {
    const startBit = reader.offset;
    const b = reader.readBits(spec.colorBits);
    rawEndpointsB.push(b);
    bitMap.push({
      name: `B ep${e}`,
      category: "endpoint",
      channel: "b",
      startBit,
      length: spec.colorBits,
      value: b,
      endpointIndex: e,
      description: `Blue component for endpoint ${e}`,
    });
  }

  // Read Alpha components (if present in mode)
  if (spec.alphaBits > 0) {
    for (let e = 0; e < numEndpoints; e++) {
      const startBit = reader.offset;
      const a = reader.readBits(spec.alphaBits);
      rawEndpointsA.push(a);
      bitMap.push({
        name: `A ep${e}`,
        category: "endpoint",
        channel: "a",
        startBit,
        length: spec.alphaBits,
        value: a,
        endpointIndex: e,
        description: `Alpha component for endpoint ${e}`,
      });
    }
  } else {
    for (let e = 0; e < numEndpoints; e++) {
      rawEndpointsA.push(255);
    }
  }

  // 6. Read P-bits
  const pBits: number[] = [];
  if (spec.pBitsPerSubset > 0) {
    // 1 P-bit per subset (shared between endpoint 0 and 1)
    for (let s = 0; s < numSubsets; s++) {
      const startBit = reader.offset;
      const p = reader.readBits(1);
      pBits.push(p);
      bitMap.push({
        name: `P-bit sub${s}`,
        category: "pbit",
        startBit,
        length: 1,
        value: p,
        subsetIndex: s,
        description: `Shared Parity bit for subset ${s}`,
      });
    }
  } else if (spec.pBitsPerEndpoint > 0) {
    // 1 P-bit per endpoint
    for (let e = 0; e < numEndpoints; e++) {
      const startBit = reader.offset;
      const p = reader.readBits(1);
      pBits.push(p);
      bitMap.push({
        name: `P-bit ep${e}`,
        category: "pbit",
        startBit,
        length: 1,
        value: p,
        endpointIndex: e,
        description: `Parity bit for endpoint ${e}`,
      });
    }
  }

  // Unquantize Endpoints
  const endpoints: Array<{ r: number; g: number; b: number; a: number }> = [];
  for (let e = 0; e < numEndpoints; e++) {
    const subsetIdx = Math.floor(e / 2);
    let pbitR: number | undefined;
    let pbitG: number | undefined;
    let pbitB: number | undefined;
    let pbitA: number | undefined;

    if (spec.pBitsPerSubset > 0) {
      pbitR = pbitG = pbitB = pbitA = pBits[subsetIdx];
    } else if (spec.pBitsPerEndpoint > 0) {
      pbitR = pbitG = pbitB = pbitA = pBits[e];
    }

    const r = unquantizeComponent(rawEndpointsR[e], spec.colorBits, pbitR);
    const g = unquantizeComponent(rawEndpointsG[e], spec.colorBits, pbitG);
    const b = unquantizeComponent(rawEndpointsB[e], spec.colorBits, pbitB);
    const a = spec.alphaBits > 0 ? unquantizeComponent(rawEndpointsA[e], spec.alphaBits, pbitA) : 255;

    endpoints.push({ r, g, b, a });
  }

  // 7. Read Texel Weight Indices
  const anchorTexels = getAnchorTexels(partitionPattern, numSubsets);
  const texelIndicesPrimary: number[] = new Array(16).fill(0);
  const texelIndicesSecondary: number[] = new Array(16).fill(0);

  // Primary index bits per texel
  let primaryIndexBits = spec.indexBitsPrimary;
  let secondaryIndexBits = spec.indexBitsSecondary;

  if (mode === 4) {
    if (indexMode === 0) {
      primaryIndexBits = 2; // RGB
      secondaryIndexBits = 3; // Alpha
    } else {
      primaryIndexBits = 3; // RGB
      secondaryIndexBits = 2; // Alpha
    }
  }

  // Read primary weight indices
  for (let i = 0; i < 16; i++) {
    const isAnchor = anchorTexels.includes(i);
    const bitsToRead = isAnchor ? primaryIndexBits - 1 : primaryIndexBits;
    const startBit = reader.offset;
    const val = reader.readBits(bitsToRead);
    texelIndicesPrimary[i] = val;
    bitMap.push({
      name: `Idx[${i}]`,
      category: "indices",
      startBit,
      length: bitsToRead,
      value: val,
      description: `Texel ${i} primary weight index${isAnchor ? " (Anchor bit MSB implicit 0)" : ""}`,
    });
  }

  // Read secondary weight indices (Mode 4 and Mode 5 for separate Alpha channel)
  if (secondaryIndexBits > 0) {
    for (let i = 0; i < 16; i++) {
      const isAnchor = i === 0;
      const bitsToRead = isAnchor ? secondaryIndexBits - 1 : secondaryIndexBits;
      const startBit = reader.offset;
      const val = reader.readBits(bitsToRead);
      texelIndicesSecondary[i] = val;
      bitMap.push({
        name: `A-Idx[${i}]`,
        category: "indices",
        startBit,
        length: bitsToRead,
        value: val,
        description: `Texel ${i} alpha weight index`,
      });
    }
  }

  // 8. Interpolate Final 4x4 Texel RGBA values
  const rgbaTexels = new Uint8ClampedArray(16 * 4);
  const texelWeights: number[] = [];

  for (let i = 0; i < 16; i++) {
    const subset = partitionPattern[i];
    const ep0 = endpoints[subset * 2];
    const ep1 = endpoints[subset * 2 + 1];

    let weightsTablePrimary = BC7_WEIGHTS_2BIT;
    if (primaryIndexBits === 3) weightsTablePrimary = BC7_WEIGHTS_3BIT;
    if (primaryIndexBits === 4) weightsTablePrimary = BC7_WEIGHTS_4BIT;

    const idxPri = texelIndicesPrimary[i];
    const weightPri = weightsTablePrimary[idxPri] || 0;
    texelWeights.push(weightPri);

    let weightSec = weightPri;
    if (secondaryIndexBits > 0) {
      let weightsTableSecondary = BC7_WEIGHTS_2BIT;
      if (secondaryIndexBits === 3) weightsTableSecondary = BC7_WEIGHTS_3BIT;
      const idxSec = texelIndicesSecondary[i];
      weightSec = weightsTableSecondary[idxSec] || 0;
    }

    // Interpolate components: c = ((64 - w) * ep0 + w * ep1 + 32) >> 6
    let r = ((64 - weightPri) * ep0.r + weightPri * ep1.r + 32) >> 6;
    let g = ((64 - weightPri) * ep0.g + weightPri * ep1.g + 32) >> 6;
    let b = ((64 - weightPri) * ep0.b + weightPri * ep1.b + 32) >> 6;
    let a = ((64 - weightSec) * ep0.a + weightSec * ep1.a + 32) >> 6;

    // Apply rotation swap if mode 4 or 5
    if (rotation === 1) {
      // Swap R and A
      const tmp = r;
      r = a;
      a = tmp;
    } else if (rotation === 2) {
      // Swap G and A
      const tmp = g;
      g = a;
      a = tmp;
    } else if (rotation === 3) {
      // Swap B and A
      const tmp = b;
      b = a;
      a = tmp;
    }

    rgbaTexels[i * 4 + 0] = Math.min(255, Math.max(0, r));
    rgbaTexels[i * 4 + 1] = Math.min(255, Math.max(0, g));
    rgbaTexels[i * 4 + 2] = Math.min(255, Math.max(0, b));
    rgbaTexels[i * 4 + 3] = Math.min(255, Math.max(0, a));
  }

  // Format Hex and Binary payload
  const hexPayload = Array.from(blockBytes.subarray(0, 16))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");

  let binaryStream = "";
  for (let i = 0; i < 16; i++) {
    binaryStream += blockBytes[i].toString(2).padStart(8, "0").split("").reverse().join("");
  }

  return {
    mode,
    partition,
    numSubsets,
    rotation,
    indexMode,
    endpoints,
    pBits,
    partitionPattern,
    texelWeights,
    rgbaTexels,
    bitMap,
    hexPayload,
    binaryStream,
  };
}
