/**
 * Texture Utilities: Image processing, full BC7 compression, and quality metric calculations
 */

import { encodeBC7Block, EncodeOptions } from "./bc7Encoder";
import { decodeBC7Block, DecodedBC7Block } from "./bc7Decoder";

export interface CompressionResult {
  compressedData: Uint8Array; // Raw BC7 payload (width/4 * height/4 * 16 bytes)
  decodedImageData: ImageData;
  errorHeatmapData: ImageData;
  width: number;
  height: number;
  totalBlocks: number;
  originalSizeBytes: number; // 32-bit RGBA (width * height * 4)
  compressedSizeBytes: number; // 4 bpp (width * height / 2)
  compressionRatio: number; // e.g. 4.0
  psnr: number; // Peak Signal-to-Noise Ratio in dB
  mse: number; // Mean Squared Error
  processingTimeMs: number;
  modeDistribution: Record<number, number>; // Count of blocks compressed in each mode
}

/**
 * Calculates Peak Signal-to-Noise Ratio (PSNR) and Mean Squared Error (MSE)
 */
export function calculateImageMetrics(
  orig: ImageData,
  compressed: ImageData
): { psnr: number; mse: number } {
  const origData = orig.data;
  const compData = compressed.data;
  const totalVals = origData.length;

  let sumSquaredDiff = 0;
  for (let i = 0; i < totalVals; i++) {
    const diff = origData[i] - compData[i];
    sumSquaredDiff += diff * diff;
  }

  const mse = sumSquaredDiff / totalVals;
  if (mse === 0) {
    return { psnr: 99.99, mse: 0 };
  }

  // PSNR = 20 * log10(MAX_I) - 10 * log10(MSE) = 10 * log10(255^2 / MSE)
  const psnr = 10 * Math.log10((255 * 255) / mse);
  return { psnr, mse };
}

/**
 * Generates an amplified error heatmap (Difference map) between original and compressed
 */
export function generateErrorHeatmap(orig: ImageData, compressed: ImageData): ImageData {
  const width = orig.width;
  const height = orig.height;
  const heatmap = new ImageData(width, height);
  const origData = orig.data;
  const compData = compressed.data;
  const heatData = heatmap.data;

  for (let i = 0; i < origData.length; i += 4) {
    const dr = Math.abs(origData[i] - compData[i]);
    const dg = Math.abs(origData[i + 1] - compData[i + 1]);
    const db = Math.abs(origData[i + 2] - compData[i + 2]);
    const da = Math.abs(origData[i + 3] - compData[i + 3]);

    // Average color error
    const err = (dr + dg + db + da) / 4;
    // Scale error for clear visual visibility (0..255)
    const amplified = Math.min(255, err * 5);

    // Thermal color ramp: Black -> Blue -> Green -> Yellow -> Red -> White
    if (amplified === 0) {
      heatData[i] = 10;
      heatData[i + 1] = 10;
      heatData[i + 2] = 20;
      heatData[i + 3] = 255;
    } else if (amplified < 64) {
      // Blue
      heatData[i] = 0;
      heatData[i + 1] = amplified * 2;
      heatData[i + 2] = 128 + amplified * 2;
      heatData[i + 3] = 255;
    } else if (amplified < 128) {
      // Green
      heatData[i] = 0;
      heatData[i + 1] = 255;
      heatData[i + 2] = 255 - amplified * 2;
      heatData[i + 3] = 255;
    } else if (amplified < 192) {
      // Yellow
      heatData[i] = (amplified - 128) * 4;
      heatData[i + 1] = 255;
      heatData[i + 2] = 0;
      heatData[i + 3] = 255;
    } else {
      // Red / White
      heatData[i] = 255;
      heatData[i + 1] = 255 - (amplified - 192) * 4;
      heatData[i + 2] = (amplified - 192) * 4;
      heatData[i + 3] = 255;
    }
  }

  return heatmap;
}

/**
 * Compresses an entire ImageData image buffer using BC7
 */
export function compressImageBC7(
  sourceImage: ImageData,
  options: EncodeOptions = {}
): CompressionResult {
  const startTime = performance.now();
  const width = sourceImage.width;
  const height = sourceImage.height;

  // Pad width/height to multiples of 4 if needed
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const totalBlocks = blocksX * blocksY;

  const compressedData = new Uint8Array(totalBlocks * 16);
  const decodedCanvas = new ImageData(width, height);

  const modeDistribution: Record<number, number> = {
    0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0
  };

  const blockTexels = new Uint8ClampedArray(16 * 4);

  let blockIdx = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      // Extract 4x4 texels from source image
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const imgX = Math.min(width - 1, bx * 4 + px);
          const imgY = Math.min(height - 1, by * 4 + py);
          const srcIdx = (imgY * width + imgX) * 4;
          const dstIdx = (py * 4 + px) * 4;

          blockTexels[dstIdx] = sourceImage.data[srcIdx];
          blockTexels[dstIdx + 1] = sourceImage.data[srcIdx + 1];
          blockTexels[dstIdx + 2] = sourceImage.data[srcIdx + 2];
          blockTexels[dstIdx + 3] = sourceImage.data[srcIdx + 3];
        }
      }

      // Encode 4x4 block to 16 bytes
      const blockPayload = encodeBC7Block(blockTexels, options);
      compressedData.set(blockPayload, blockIdx * 16);

      // Immediately decode block back to verify decoded Image
      const decodedBlock = decodeBC7Block(blockPayload);
      modeDistribution[decodedBlock.mode] = (modeDistribution[decodedBlock.mode] || 0) + 1;

      // Copy decoded 4x4 block to target decoded ImageData
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const imgX = bx * 4 + px;
          const imgY = by * 4 + py;
          if (imgX < width && imgY < height) {
            const dstIdx = (imgY * width + imgX) * 4;
            const srcIdx = (py * 4 + px) * 4;

            decodedCanvas.data[dstIdx] = decodedBlock.rgbaTexels[srcIdx];
            decodedCanvas.data[dstIdx + 1] = decodedBlock.rgbaTexels[srcIdx + 1];
            decodedCanvas.data[dstIdx + 2] = decodedBlock.rgbaTexels[srcIdx + 2];
            decodedCanvas.data[dstIdx + 3] = decodedBlock.rgbaTexels[srcIdx + 3];
          }
        }
      }

      blockIdx++;
    }
  }

  const { psnr, mse } = calculateImageMetrics(sourceImage, decodedCanvas);
  const errorHeatmapData = generateErrorHeatmap(sourceImage, decodedCanvas);

  const originalSizeBytes = width * height * 4;
  const compressedSizeBytes = totalBlocks * 16;
  const compressionRatio = originalSizeBytes / compressedSizeBytes;
  const processingTimeMs = Math.round(performance.now() - startTime);

  return {
    compressedData,
    decodedImageData: decodedCanvas,
    errorHeatmapData,
    width,
    height,
    totalBlocks,
    originalSizeBytes,
    compressedSizeBytes,
    compressionRatio,
    psnr,
    mse,
    processingTimeMs,
    modeDistribution,
  };
}

/**
 * Creates a procedural 128x128 test gradient texture for instant demo
 */
export function createProceduralTestTexture(type: "gradient" | "checkers" | "alpha" | "normal"): ImageData {
  const size = 128;
  const imgData = new ImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;

      if (type === "gradient") {
        data[i] = Math.round(u * 255);
        data[i + 1] = Math.round(v * 255);
        data[i + 2] = Math.round((1 - u * v) * 255);
        data[i + 3] = 255;
      } else if (type === "checkers") {
        const check = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0;
        data[i] = check ? 240 : 40;
        data[i + 1] = check ? 100 : 180;
        data[i + 2] = check ? 80 : 230;
        data[i + 3] = 255;
      } else if (type === "alpha") {
        // Concentric glowing circle with alpha fade
        const dx = u - 0.5;
        const dy = v - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        data[i] = Math.round(255 * (1 - dist));
        data[i + 1] = Math.round(180 * dist);
        data[i + 2] = 240;
        data[i + 3] = Math.max(0, Math.min(255, Math.round((0.5 - dist) * 2 * 255)));
      } else if (type === "normal") {
        // Normal map style sphere bump
        const dx = (u - 0.5) * 2;
        const dy = (v - 0.5) * 2;
        const r2 = dx * dx + dy * dy;
        let nz = 1.0;
        let nx = dx;
        let ny = dy;
        if (r2 < 1.0) {
          nz = Math.sqrt(1.0 - r2);
        } else {
          const len = Math.sqrt(r2);
          nx /= len;
          ny /= len;
          nz = 0.0;
        }
        data[i] = Math.round((nx * 0.5 + 0.5) * 255);
        data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[i + 3] = 255;
      }
    }
  }

  return imgData;
}
