import React, { useState, useMemo } from "react";
import { BitStreamWriter } from "../lib/bc7/bc7Encoder";
import { decodeBC7Block, DecodedBC7Block } from "../lib/bc7/bc7Decoder";
import {
  BC7_MODE_SPECS,
  BC7_PARTITIONS_2_SUBSET,
  BC7_PARTITIONS_3_SUBSET,
  getAnchorTexels,
} from "../lib/bc7/bc7Tables";
import { Sliders, Sparkles, RefreshCw, Cpu, Layers, Grid, ShieldCheck, Info } from "lucide-react";

export const BitSandbox: React.FC = () => {
  const [mode, setMode] = useState<number>(6);
  const [partitionIdx, setPartitionIdx] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);
  const [indexSelection, setIndexSelection] = useState<number>(0);

  // Endpoints state (up to 6 endpoints for 3-subset modes)
  const [endpointsRGB, setEndpointsRGB] = useState<
    Array<{ r: number; g: number; b: number; a: number }>
  >([
    { r: 240, g: 60, b: 80, a: 255 },
    { r: 40, g: 180, b: 240, a: 255 },
    { r: 60, g: 220, b: 100, a: 255 },
    { r: 220, g: 200, b: 40, a: 255 },
    { r: 100, g: 100, b: 250, a: 255 },
    { r: 250, g: 180, b: 80, a: 255 },
  ]);

  const [pBits, setPBits] = useState<number[]>([1, 0, 1, 0, 1, 0]);
  const [weights, setWeights] = useState<number[]>([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
  const [alphaWeights, setAlphaWeights] = useState<number[]>([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
  const [activeWeightTab, setActiveWeightTab] = useState<"primary" | "secondary">("primary");

  const spec = BC7_MODE_SPECS[mode];

  // Determine partition shape & anchor texels
  const partitionPattern = useMemo(() => {
    if (spec.subsets === 2) {
      return BC7_PARTITIONS_2_SUBSET[partitionIdx % 64] || new Array(16).fill(0);
    }
    if (spec.subsets === 3) {
      return BC7_PARTITIONS_3_SUBSET[partitionIdx % 64] || new Array(16).fill(0);
    }
    return new Array(16).fill(0);
  }, [spec.subsets, partitionIdx]);

  const anchorTexels = useMemo(() => {
    return getAnchorTexels(partitionPattern, spec.subsets);
  }, [partitionPattern, spec.subsets]);

  // Build binary payload directly from sandbox controls
  const payloadBytes = useMemo(() => {
    const writer = new BitStreamWriter();

    // 1. Write Mode prefix (mode '0' bits followed by '1')
    writer.writeBits(0, mode);
    writer.writeBits(1, 1); // Termination bit for mode

    // 2. Partition
    if (spec.partitionBits > 0) {
      writer.writeBits(partitionIdx & ((1 << spec.partitionBits) - 1), spec.partitionBits);
    }

    // 3. Rotation (if mode 4 or 5)
    if (spec.rotationBits > 0) {
      writer.writeBits(rotation & ((1 << spec.rotationBits) - 1), spec.rotationBits);
    }

    // 4. Index Selection bit (if mode 4)
    if (spec.indexSelectionBits > 0) {
      writer.writeBits(indexSelection & 1, spec.indexSelectionBits);
    }

    const numEndpoints = spec.subsets * 2;
    const shiftColor = 8 - spec.colorBits;

    // Write Endpoints: R, G, B
    for (let e = 0; e < numEndpoints; e++) {
      const ep = endpointsRGB[e] || { r: 128, g: 128, b: 128, a: 255 };
      writer.writeBits(ep.r >> shiftColor, spec.colorBits);
    }
    for (let e = 0; e < numEndpoints; e++) {
      const ep = endpointsRGB[e] || { r: 128, g: 128, b: 128, a: 255 };
      writer.writeBits(ep.g >> shiftColor, spec.colorBits);
    }
    for (let e = 0; e < numEndpoints; e++) {
      const ep = endpointsRGB[e] || { r: 128, g: 128, b: 128, a: 255 };
      writer.writeBits(ep.b >> shiftColor, spec.colorBits);
    }

    // Write Endpoints: A (if alphaBits > 0)
    if (spec.alphaBits > 0) {
      const shiftAlpha = 8 - spec.alphaBits;
      for (let e = 0; e < numEndpoints; e++) {
        const ep = endpointsRGB[e] || { r: 128, g: 128, b: 128, a: 255 };
        writer.writeBits(ep.a >> shiftAlpha, spec.alphaBits);
      }
    }

    // Write P-bits
    const pCount = spec.pBitsPerEndpoint ? numEndpoints : spec.pBitsPerSubset ? spec.subsets : 0;
    for (let p = 0; p < pCount; p++) {
      writer.writeBits(pBits[p] || 0, 1);
    }

    // Determine primary and secondary index bit depths
    let primaryIndexBits = spec.indexBitsPrimary;
    let secondaryIndexBits = spec.indexBitsSecondary;

    if (mode === 4) {
      if (indexSelection === 0) {
        primaryIndexBits = 2; // RGB
        secondaryIndexBits = 3; // Alpha
      } else {
        primaryIndexBits = 3; // RGB
        secondaryIndexBits = 2; // Alpha
      }
    }

    // Write Primary Texel Indices (anchor texels store 1 fewer bit)
    for (let i = 0; i < 16; i++) {
      const isAnchor = anchorTexels.includes(i);
      const bitsToWrite = isAnchor ? primaryIndexBits - 1 : primaryIndexBits;
      const wVal = (weights[i] || 0) & ((1 << bitsToWrite) - 1);
      writer.writeBits(wVal, bitsToWrite);
    }

    // Write Secondary Texel Indices (Mode 4 and Mode 5 for separate Alpha)
    if (secondaryIndexBits > 0) {
      for (let i = 0; i < 16; i++) {
        const isAnchor = i === 0; // Subset 0 anchor
        const bitsToWrite = isAnchor ? secondaryIndexBits - 1 : secondaryIndexBits;
        const wVal = (alphaWeights[i] || 0) & ((1 << bitsToWrite) - 1);
        writer.writeBits(wVal, bitsToWrite);
      }
    }

    return writer.bytes;
  }, [
    mode,
    partitionIdx,
    rotation,
    indexSelection,
    endpointsRGB,
    pBits,
    weights,
    alphaWeights,
    anchorTexels,
    spec,
  ]);

  // Decode synthesized payload
  const decoded = useMemo(() => {
    return decodeBC7Block(payloadBytes);
  }, [payloadBytes]);

  const updateEndpointColor = (
    idx: number,
    channel: "r" | "g" | "b" | "a",
    val: number
  ) => {
    const updated = [...endpointsRGB];
    if (!updated[idx]) updated[idx] = { r: 128, g: 128, b: 128, a: 255 };
    updated[idx] = { ...updated[idx], [channel]: val };
    setEndpointsRGB(updated);
  };

  const togglePBit = (idx: number) => {
    const updated = [...pBits];
    updated[idx] = updated[idx] === 1 ? 0 : 1;
    setPBits(updated);
  };

  // Determine current effective primary & secondary index bit depths
  const primaryBitsEff =
    mode === 4 ? (indexSelection === 0 ? 2 : 3) : spec.indexBitsPrimary;
  const secondaryBitsEff =
    mode === 4 ? (indexSelection === 0 ? 3 : 2) : spec.indexBitsSecondary;

  return (
    <div className="space-y-6">
      {/* Sandbox Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sliders className="h-5 w-5 text-cyan-400" />
              <span>128-Bit 二进制合成沙盒 (BC7 Bitstream Payload Synthesizer)</span>
            </h2>
            <p className="text-xs text-slate-400">
              手动设定 Mode、分割 Shape、旋转通道、端点 RGBA、P-bit 与 16 像素权值，实时合成并检验 BC7 16 字节 Bitstream
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">选择模式 Mode:</span>
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`h-7 w-7 rounded-lg text-xs font-bold transition border ${
                    mode === m
                      ? "bg-cyan-500 text-black border-cyan-400 font-extrabold shadow-lg"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  M{m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mode Summary Badge */}
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="font-bold text-cyan-400">Mode {spec.mode}:</span>{" "}
            <span className="text-slate-300">{spec.description}</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <span>Subsets: <strong className="text-white">{spec.subsets}</strong></span>
            <span>RGB: <strong className="text-cyan-300">{spec.colorBits}b</strong></span>
            {spec.alphaBits > 0 && (
              <span>Alpha: <strong className="text-emerald-300">{spec.alphaBits}b</strong></span>
            )}
            <span>
              P-bits:{" "}
              <strong className="text-amber-300">
                {spec.pBitsPerEndpoint
                  ? `${spec.pBitsPerEndpoint}/EP`
                  : spec.pBitsPerSubset
                  ? `${spec.pBitsPerSubset}/Sub`
                  : "0"}
              </strong>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Mode Specific Configurations (Partitions, Rotation, Index Mode) */}
          {(spec.partitionBits > 0 || spec.rotationBits > 0 || spec.indexSelectionBits > 0) && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Grid className="h-4 w-4 text-cyan-400" />
                <span>模式专属控制 (Partition / Rotation / Index Selector)</span>
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Partition Shape Selector */}
                {spec.partitionBits > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-300">Partition Shape</span>
                      <span className="font-mono text-cyan-400 font-bold">
                        #{partitionIdx} / {(1 << spec.partitionBits) - 1}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={(1 << spec.partitionBits) - 1}
                      value={partitionIdx}
                      onChange={(e) => setPartitionIdx(parseInt(e.target.value))}
                      className="w-full accent-cyan-500"
                    />

                    {/* Partition shape mini grid preview */}
                    <div className="grid grid-cols-4 gap-0.5 p-1 bg-slate-900 rounded border border-slate-800 aspect-square w-20 mx-auto">
                      {partitionPattern.map((sub, texelIdx) => (
                        <div
                          key={texelIdx}
                          className={`aspect-square rounded-[2px] ${
                            sub === 0
                              ? "bg-cyan-500"
                              : sub === 1
                              ? "bg-purple-500"
                              : "bg-emerald-500"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Rotation Selector (Mode 4 / 5) */}
                {spec.rotationBits > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                    <div className="text-xs font-bold text-slate-300">Channel Rotation</div>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      {[
                        { val: 0, label: "00: 无 (Normal)" },
                        { val: 1, label: "01: R/A 交换" },
                        { val: 2, label: "10: G/A 交换" },
                        { val: 3, label: "11: B/A 交换" },
                      ].map((r) => (
                        <button
                          key={r.val}
                          onClick={() => setRotation(r.val)}
                          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition border ${
                            rotation === r.val
                              ? "bg-cyan-500 text-black border-cyan-400 font-bold"
                              : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Index Selection Selector (Mode 4) */}
                {spec.indexSelectionBits > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                    <div className="text-xs font-bold text-slate-300">Index Mode Selector</div>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <button
                        onClick={() => setIndexSelection(0)}
                        className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition border ${
                          indexSelection === 0
                            ? "bg-cyan-500 text-black border-cyan-400 font-bold"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                        }`}
                      >
                        0: RGB 2b / A 3b
                      </button>
                      <button
                        onClick={() => setIndexSelection(1)}
                        className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition border ${
                          indexSelection === 1
                            ? "bg-cyan-500 text-black border-cyan-400 font-bold"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                        }`}
                      >
                        1: RGB 3b / A 2b
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Endpoints & P-bit Controls */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white">端点颜色 RGBA & Parity P-bit 设置</h3>

              {/* P-bits toggle controls if available */}
              {(spec.pBitsPerEndpoint > 0 || spec.pBitsPerSubset > 0) && (
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400 font-semibold">Parity P-bits:</span>
                  <div className="flex gap-1">
                    {Array.from({
                      length: spec.pBitsPerEndpoint
                        ? spec.subsets * 2
                        : spec.pBitsPerSubset
                        ? spec.subsets
                        : 0,
                    }).map((_, pIdx) => {
                      const active = (pBits[pIdx] || 0) === 1;
                      return (
                        <button
                          key={pIdx}
                          onClick={() => togglePBit(pIdx)}
                          className={`h-6 px-2 rounded text-[10px] font-bold transition border ${
                            active
                              ? "bg-amber-500 text-black border-amber-400 font-extrabold"
                              : "bg-slate-950 text-slate-500 border-slate-800 hover:text-white"
                          }`}
                        >
                          P{pIdx}: {active ? "1" : "0"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: spec.subsets * 2 }).map((_, eIdx) => {
                const ep = endpointsRGB[eIdx] || { r: 128, g: 128, b: 128, a: 255 };
                const shiftColor = 8 - spec.colorBits;
                const shiftAlpha = 8 - spec.alphaBits;

                const qR = ep.r >> shiftColor;
                const qG = ep.g >> shiftColor;
                const qB = ep.b >> shiftColor;
                const qA = spec.alphaBits > 0 ? ep.a >> shiftAlpha : 255;

                return (
                  <div
                    key={eIdx}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span>Endpoint #{eIdx} (Subset {Math.floor(eIdx / 2)})</span>
                      <div
                        className="h-5 w-10 rounded border border-white/20 shadow-inner"
                        style={{
                          backgroundColor: `rgba(${ep.r}, ${ep.g}, ${ep.b}, ${ep.a / 255})`,
                        }}
                      />
                    </div>

                    <div className="space-y-1.5 text-[11px]">
                      {/* Red */}
                      <div className="flex items-center gap-2">
                        <span className="w-4 font-mono text-red-400 font-bold">R</span>
                        <input
                          type="range"
                          min={0}
                          max={255}
                          value={ep.r}
                          onChange={(e) => updateEndpointColor(eIdx, "r", parseInt(e.target.value))}
                          className="w-full accent-red-500"
                        />
                        <span className="w-12 text-right font-mono text-slate-400 text-[10px]">
                          {ep.r} ({qR}b)
                        </span>
                      </div>

                      {/* Green */}
                      <div className="flex items-center gap-2">
                        <span className="w-4 font-mono text-emerald-400 font-bold">G</span>
                        <input
                          type="range"
                          min={0}
                          max={255}
                          value={ep.g}
                          onChange={(e) => updateEndpointColor(eIdx, "g", parseInt(e.target.value))}
                          className="w-full accent-emerald-500"
                        />
                        <span className="w-12 text-right font-mono text-slate-400 text-[10px]">
                          {ep.g} ({qG}b)
                        </span>
                      </div>

                      {/* Blue */}
                      <div className="flex items-center gap-2">
                        <span className="w-4 font-mono text-blue-400 font-bold">B</span>
                        <input
                          type="range"
                          min={0}
                          max={255}
                          value={ep.b}
                          onChange={(e) => updateEndpointColor(eIdx, "b", parseInt(e.target.value))}
                          className="w-full accent-blue-500"
                        />
                        <span className="w-12 text-right font-mono text-slate-400 text-[10px]">
                          {ep.b} ({qB}b)
                        </span>
                      </div>

                      {/* Alpha (if present) */}
                      {spec.alphaBits > 0 && (
                        <div className="flex items-center gap-2 border-t border-slate-900 pt-1">
                          <span className="w-4 font-mono text-purple-400 font-bold">A</span>
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={ep.a}
                            onChange={(e) => updateEndpointColor(eIdx, "a", parseInt(e.target.value))}
                            className="w-full accent-purple-500"
                          />
                          <span className="w-12 text-right font-mono text-slate-400 text-[10px]">
                            {ep.a} ({qA}b)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Texel Weights Matrix Sliders */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">
                16 像素插值权值 (Texel Interpolation Weights)
              </h3>

              {secondaryBitsEff > 0 && (
                <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
                  <button
                    onClick={() => setActiveWeightTab("primary")}
                    className={`rounded px-2.5 py-0.5 font-semibold transition ${
                      activeWeightTab === "primary"
                        ? "bg-cyan-500 text-black font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    RGB Weights ({primaryBitsEff}b)
                  </button>
                  <button
                    onClick={() => setActiveWeightTab("secondary")}
                    className={`rounded px-2.5 py-0.5 font-semibold transition ${
                      activeWeightTab === "secondary"
                        ? "bg-purple-500 text-white font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Alpha Weights ({secondaryBitsEff}b)
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 16 }).map((_, i) => {
                const isAnchorPri = anchorTexels.includes(i);
                const isAnchorSec = i === 0;

                const isAnchorCurrent =
                  activeWeightTab === "primary" ? isAnchorPri : isAnchorSec;
                const maxBits =
                  activeWeightTab === "primary" ? primaryBitsEff : secondaryBitsEff;
                const maxVal = (1 << (isAnchorCurrent ? maxBits - 1 : maxBits)) - 1;

                const currentVal =
                  activeWeightTab === "primary" ? weights[i] || 0 : alphaWeights[i] || 0;

                return (
                  <div
                    key={i}
                    className={`rounded-lg bg-slate-950 p-2 border text-center transition ${
                      isAnchorCurrent ? "border-amber-500/50 bg-amber-950/10" : "border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>#{i}</span>
                      {isAnchorCurrent && (
                        <span className="text-[9px] font-bold text-amber-400">Anchor</span>
                      )}
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={maxVal}
                      value={Math.min(currentVal, maxVal)}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (activeWeightTab === "primary") {
                          const updated = [...weights];
                          updated[i] = val;
                          setWeights(updated);
                        } else {
                          const updated = [...alphaWeights];
                          updated[i] = val;
                          setAlphaWeights(updated);
                        }
                      }}
                      className="w-full accent-cyan-500"
                    />

                    <div className="text-xs font-bold text-cyan-400 font-mono mt-0.5">
                      {Math.min(currentVal, maxVal)} / {maxVal}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Output Canvas & Hex/Bit Breakdown (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white">
              合成的 4x4 解码效果 (Synthesized 4x4 Canvas)
            </h3>

            <div className="grid grid-cols-4 gap-1.5 p-3 bg-slate-950 rounded-2xl border border-slate-800 aspect-square">
              {Array.from({ length: 16 }).map((_, i) => {
                const r = decoded.rgbaTexels[i * 4];
                const g = decoded.rgbaTexels[i * 4 + 1];
                const b = decoded.rgbaTexels[i * 4 + 2];
                const a = decoded.rgbaTexels[i * 4 + 3];

                return (
                  <div
                    key={i}
                    style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${a / 255})` }}
                    className="relative aspect-square rounded-xl border border-slate-800 shadow-inner flex flex-col justify-between p-1 group hover:border-cyan-400 transition"
                  >
                    <span className="text-[8px] text-white/80 font-mono font-bold bg-black/40 px-1 rounded w-fit">
                      #{i}
                    </span>
                    <div className="text-[7px] text-cyan-200 font-mono text-right bg-black/50 p-0.5 rounded leading-tight">
                      <div>w:{decoded.texelWeights[i]}</div>
                      <div>
                        {r},{g},{b}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hex Payload */}
            <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-400 font-mono">16 字节十六进制 Payload (128 bits):</div>
              <div className="text-xs font-mono font-bold text-cyan-300 break-all bg-slate-900 p-2 rounded">
                {decoded.hexPayload}
              </div>
            </div>

            {/* 128-Bit Breakdown Table */}
            <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 space-y-2">
              <div className="text-xs font-bold text-white flex items-center justify-between">
                <span>128-Bit 字段细分表 (Bit Layout Breakdown)</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {decoded.bitMap.reduce((acc, f) => acc + f.length, 0)} / 128 bits
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 pr-1 text-[10px] font-mono">
                {decoded.bitMap.map((field, fIdx) => (
                  <div
                    key={fIdx}
                    className="flex items-center justify-between rounded bg-slate-900/80 px-2 py-1 border border-slate-800/80"
                  >
                    <span className="text-cyan-300 font-bold">{field.name}</span>
                    <span className="text-slate-400">
                      [{field.startBit}..{field.startBit + field.length - 1}] ({field.length}b) ={" "}
                      <strong className="text-amber-300">{field.value}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

