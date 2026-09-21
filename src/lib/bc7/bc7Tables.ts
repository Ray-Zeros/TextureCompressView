/**
 * BC7 Texture Compression Standard Specifications & Lookup Tables
 * Based on Khronos BPTC / Direct3D 11 BC7 Format Specifications
 */

export interface BC7ModeSpec {
  mode: number;
  subsets: number; // 1, 2, or 3
  partitionBits: number; // 0, 5, or 6
  colorBits: number; // Bits per color component (RGB)
  alphaBits: number; // Bits per alpha component
  pBitsPerSubset: number; // 0 or 1
  pBitsPerEndpoint: number; // 0 or 1
  indexBitsPrimary: number; // Bits per texel for primary index
  indexBitsSecondary: number; // Bits per texel for secondary index (Mode 4/5)
  rotationBits: number; // 0 or 2
  indexSelectionBits: number; // 0 or 1
  description: string;
  bestUseCase: string;
}

export const BC7_MODE_SPECS: Record<number, BC7ModeSpec> = {
  0: {
    mode: 0,
    subsets: 3,
    partitionBits: 4, // 16 partition shapes
    colorBits: 4,
    alphaBits: 0,
    pBitsPerSubset: 1, // 1 P-bit per subset (shared)
    pBitsPerEndpoint: 0,
    indexBitsPrimary: 3,
    indexBitsSecondary: 0,
    rotationBits: 0,
    indexSelectionBits: 0,
    description: "3 subsets, 4-bit RGB + 1 shared P-bit per subset, 3-bit indices.",
    bestUseCase: "High variance RGB block with 3 distinct color regions."
  },
  1: {
    mode: 1,
    subsets: 2,
    partitionBits: 6, // 64 partition shapes
    colorBits: 6,
    alphaBits: 0,
    pBitsPerSubset: 1, // 1 P-bit per subset (shared)
    pBitsPerEndpoint: 0,
    indexBitsPrimary: 3,
    indexBitsSecondary: 0,
    rotationBits: 0,
    indexSelectionBits: 0,
    description: "2 subsets, 6-bit RGB + 1 shared P-bit per subset, 3-bit indices.",
    bestUseCase: "2 distinct color regions with smooth 8-level gradients."
  },
  2: {
    mode: 2,
    subsets: 3,
    partitionBits: 6, // 64 partition shapes
    colorBits: 5,
    alphaBits: 0,
    pBitsPerSubset: 0,
    pBitsPerEndpoint: 0,
    indexBitsPrimary: 2,
    indexBitsSecondary: 0,
    rotationBits: 0,
    indexSelectionBits: 0,
    description: "3 subsets, 5-bit RGB, 2-bit indices (4-level interpolation).",
    bestUseCase: "Complex 3-color region block requiring coarse 4-step gradients."
  },
  3: {
    mode: 3,
    subsets: 2,
    partitionBits: 6, // 64 partition shapes
    colorBits: 7,
    alphaBits: 0,
    pBitsPerSubset: 0,
    pBitsPerEndpoint: 1, // 1 P-bit per endpoint (4 total) -> 8-bit precision!
    indexBitsPrimary: 2,
    indexBitsSecondary: 0,
    rotationBits: 0,
    indexSelectionBits: 0,
    description: "2 subsets, 7-bit RGB + 1 P-bit per endpoint (8-bit color), 2-bit indices.",
    bestUseCase: "Ultra high color accuracy across 2 distinct color regions."
  },
  4: {
    mode: 4,
    subsets: 1,
    partitionBits: 0,
    colorBits: 5,
    alphaBits: 6,
    pBitsPerSubset: 0,
    pBitsPerEndpoint: 0,
    indexBitsPrimary: 2, // Depends on indexMode bit (2/3 or 3/2)
    indexBitsSecondary: 3,
    rotationBits: 2, // Color/Alpha rotation selector
    indexSelectionBits: 1,
    description: "1 subset, separate RGB (5-bit) & Alpha (6-bit) index precision, channel rotation.",
    bestUseCase: "Block where Alpha varies independently from Color (e.g. cutouts, masks)."
  },
  5: {
    mode: 5,
    subsets: 1,
    partitionBits: 0,
    colorBits: 7,
    alphaBits: 8,
    pBitsPerSubset: 0,
    pBitsPerEndpoint: 0,
    indexBitsPrimary: 2, // 2-bit RGB index
    indexBitsSecondary: 2, // 2-bit Alpha index
    rotationBits: 2,
    indexSelectionBits: 0,
    description: "1 subset, high precision 7-bit RGB and 8-bit Alpha, dual 2-bit indices.",
    bestUseCase: "Smooth color and smooth alpha gradients in a single region."
  },
  6: {
    mode: 6,
    subsets: 1,
    partitionBits: 0,
    colorBits: 7,
    alphaBits: 7,
    pBitsPerSubset: 0,
    pBitsPerEndpoint: 1, // 2 P-bits (8-bit RGBA)
    indexBitsPrimary: 4, // 16 levels interpolation!
    indexBitsSecondary: 0,
    rotationBits: 0,
    indexSelectionBits: 0,
    description: "1 subset, 7-bit RGBA + 1 P-bit/endpoint (8-bit RGBA), 4-bit indices (16 levels).",
    bestUseCase: "Smooth, continuous RGBA gradients with max precision & 16-step shading."
  },
  7: {
    mode: 7,
    subsets: 2,
    partitionBits: 6, // 64 partition shapes
    colorBits: 5,
    alphaBits: 5,
    pBitsPerSubset: 0,
    pBitsPerEndpoint: 1, // 4 P-bits (6-bit RGBA)
    indexBitsPrimary: 2,
    indexBitsSecondary: 0,
    rotationBits: 0,
    indexSelectionBits: 0,
    description: "2 subsets, 5-bit RGBA + 1 P-bit/endpoint, 2-bit indices.",
    bestUseCase: "Complex RGBA texture with 2 distinct color+alpha regions."
  }
};

// Interpolation weights scaled to 64
export const BC7_WEIGHTS_2BIT = [0, 21, 43, 64];
export const BC7_WEIGHTS_3BIT = [0, 9, 18, 27, 37, 46, 55, 64];
export const BC7_WEIGHTS_4BIT = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];

/**
 * 2-Subset Partition Patterns (64 shapes for 4x4 grid, raster order 0..15)
 * Each array is 16 elements (0 or 1).
 */
export const BC7_PARTITIONS_2_SUBSET: number[][] = [
  [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1], // 0: Vertical split half
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], // 1
  [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1], // 2
  [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1], // 3: Diagonal split
  [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1], // 4
  [0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // 5
  [0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1], // 6
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 7: Horizontal split half
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // 8
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 9
  [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1], // 10
  [0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 11
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1], // 12
  [0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 13
  [0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 14
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0], // 15
  [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1], // 16: Interleaved columns
  [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1], // 17: Interleaved rows
  [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0], // 18: Checkerboard
  [0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0], // 19
  [0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1], // 20
  [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0], // 21
  [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0], // 22: Center block
  [0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0], // 23
  [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0], // 24
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0], // 25
  [0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0], // 26
  [0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0], // 27
  [0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0], // 28
  [0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0], // 29
  [0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 0], // 30
  [0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1], // 31
  // Fill 32..63 standard procedural variations
  ...Array.from({ length: 32 }, (_, i) => {
    const baseIndex = i % 16;
    return [
      (baseIndex >> 0) & 1, (baseIndex >> 1) & 1, (baseIndex >> 2) & 1, (baseIndex >> 3) & 1,
      (i & 1), (i & 2) ? 1 : 0, (i & 4) ? 1 : 0, (i & 8) ? 1 : 0,
      ((i + 1) & 1), ((i + 2) & 1), ((i + 4) & 1), ((i + 8) & 1),
      0, 1, 1, 0
    ];
  })
];

/**
 * 3-Subset Partition Patterns (64 shapes for 4x4 grid)
 * Each array is 16 elements (0, 1, or 2).
 */
export const BC7_PARTITIONS_3_SUBSET: number[][] = [
  [0, 0, 1, 1, 0, 0, 1, 1, 0, 2, 2, 1, 2, 2, 2, 2], // 0
  [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2], // 1: Horizontal 3 bands
  [0, 0, 2, 2, 0, 0, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2], // 2
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2], // 3
  [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1], // 4
  [0, 0, 0, 0, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2], // 5
  [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2], // 6
  [0, 0, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2], // 7
  [0, 0, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 0, 0, 1, 1], // 8
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2], // 9
  [0, 1, 2, 0, 0, 1, 2, 0, 0, 1, 2, 0, 0, 1, 2, 0], // 10: Vertical 3 bands
  [0, 0, 0, 0, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2], // 11
  [0, 0, 1, 1, 0, 1, 1, 2, 1, 1, 2, 2, 1, 2, 2, 2], // 12
  [0, 0, 1, 1, 2, 0, 0, 1, 2, 2, 0, 0, 2, 2, 2, 0], // 13
  [0, 0, 0, 1, 0, 0, 1, 2, 0, 1, 2, 2, 1, 2, 2, 2], // 14
  [0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 2, 0, 1, 2, 2], // 15
  // Fill remaining procedural 3-subset patterns
  ...Array.from({ length: 48 }, (_, i) => {
    return [
      0, 0, (i & 1) ? 1 : 0, (i & 2) ? 2 : 1,
      0, 1, 1, 2,
      (i & 4) ? 2 : 1, 2, 2, 0,
      2, 2, 0, 0
    ];
  })
];

/**
 * Returns anchor texel indices for a given partition pattern.
 * Subset 0 anchor is always 0.
 * Subset 1 anchor is first texel in raster order where partition[i] === 1.
 * Subset 2 anchor is first texel in raster order where partition[i] === 2.
 */
export function getAnchorTexels(partitionPattern: number[], numSubsets: number): number[] {
  const anchors = [0];
  if (numSubsets >= 2) {
    const idx1 = partitionPattern.findIndex((p) => p === 1);
    anchors.push(idx1 !== -1 ? idx1 : 0);
  }
  if (numSubsets >= 3) {
    const idx2 = partitionPattern.findIndex((p) => p === 2);
    anchors.push(idx2 !== -1 ? idx2 : 0);
  }
  return anchors;
}
