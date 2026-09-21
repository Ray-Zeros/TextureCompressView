import React, { useState } from "react";
import {
  BC7_MODE_SPECS,
  BC7_PARTITIONS_2_SUBSET,
  BC7_PARTITIONS_3_SUBSET,
  getAnchorTexels,
} from "../lib/bc7/bc7Tables";
import { Grid, Layers, ShieldCheck, Sparkles, HelpCircle, Eye } from "lucide-react";

export const ModeMatrixExplorer: React.FC = () => {
  const [selectedMode, setSelectedMode] = useState<number>(6);
  const [partitionSubsetCount, setPartitionSubsetCount] = useState<2 | 3>(2);
  const [searchPartitionIdx, setSearchPartitionIdx] = useState<number | null>(null);

  const partitions =
    partitionSubsetCount === 2 ? BC7_PARTITIONS_2_SUBSET : BC7_PARTITIONS_3_SUBSET;

  return (
    <div className="space-y-8">
      {/* 1. BC7 8-Mode Spec Reference Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>BC7 8 种编码模式规格矩阵 (BC7 Mode Specification Matrix)</span>
            </h2>
            <p className="text-xs text-slate-400">
              BC7 针对不同颜色纹理结构（单区、双区分割、三区分割、单独 Alpha 频率）提供 8 种自适应 Block 模式
            </p>
          </div>
        </div>

        {/* Modes Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.values(BC7_MODE_SPECS).map((spec) => {
            const isSelected = selectedMode === spec.mode;
            return (
              <div
                key={spec.mode}
                onClick={() => setSelectedMode(spec.mode)}
                className={`group relative flex flex-col justify-between rounded-xl border p-4 cursor-pointer transition-all ${
                  isSelected
                    ? "border-cyan-400 bg-cyan-950/20 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/50"
                    : "border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900/60"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-xs font-bold text-cyan-300">
                      Mode {spec.mode}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {spec.subsets} Subset{spec.subsets > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-slate-200">{spec.description}</div>

                  <div className="space-y-1 text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
                    <div className="flex justify-between">
                      <span>RGB/A 精度:</span>
                      <span className="text-cyan-400 font-bold">
                        {spec.colorBits}b RGB {spec.alphaBits > 0 ? `/ ${spec.alphaBits}b A` : ""}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>P-bits (Parity):</span>
                      <span className="text-amber-400 font-bold">
                        {spec.pBitsPerEndpoint > 0
                          ? `${spec.pBitsPerEndpoint}/EP`
                          : spec.pBitsPerSubset > 0
                          ? `${spec.pBitsPerSubset}/Sub`
                          : "None"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Texel 权值:</span>
                      <span className="text-rose-400 font-bold">
                        {spec.indexBitsPrimary} bits ({1 << spec.indexBitsPrimary} levels)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-slate-900/80 p-2 text-[10px] text-slate-400 leading-tight">
                  <span className="text-cyan-300 font-semibold">最佳应用场景:</span> {spec.bestUseCase}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Partition Shapes Visualizer */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Grid className="h-5 w-5 text-cyan-400" />
              <span>BC7 预置分割形状矩阵 (Partition Shape Explorer)</span>
            </h3>
            <p className="text-xs text-slate-400">
              BC7 预置了 64 种双区域 (2-Subset) 和 64 种三区域 (3-Subset) 4x4 像素分割形状，并配合锚点像素 (Anchor Texel) 优化
            </p>
          </div>

          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setPartitionSubsetCount(2)}
              className={`rounded-md px-3 py-1 font-semibold transition ${
                partitionSubsetCount === 2 ? "bg-cyan-500 text-black font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              2 Subsets (64 Shapes)
            </button>
            <button
              onClick={() => setPartitionSubsetCount(3)}
              className={`rounded-md px-3 py-1 font-semibold transition ${
                partitionSubsetCount === 3 ? "bg-cyan-500 text-black font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              3 Subsets (64 Shapes)
            </button>
          </div>
        </div>

        {/* Anchor Texel Explanation Card */}
        <div className="rounded-xl bg-cyan-950/20 border border-cyan-800/40 p-4 text-xs text-slate-300 space-y-1.5 leading-relaxed">
          <div className="font-bold text-cyan-300 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span>BC7 锚点像素 (Anchor Texel) 隐式 MSB 省位技巧说明:</span>
          </div>
          <p>
            为节省 128 位极为宝贵的空间，BC7 规定每个 Subset 的首个扫描像素为该 Subset 的<strong>锚点 (Anchor Texel)</strong>。
            Subset 0 的锚点固定为像素 #0；Subset 1 和 Subset 2 的锚点分别为对应区域在 0..15 扫描顺序中首次出现的像素（图中带有 <span className="text-amber-400 font-bold">A</span> 标记）。
            由于编码器能确保 Endpoint 顺序可颠换，锚点像素的权值最高有效位 (MSB) 始终隐式为 0，每个 Subset 节省 1 bit，累计节省 2-3 比特！
          </p>
        </div>

        {/* 64 Partitions Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 max-h-[520px] overflow-y-auto p-1">
          {partitions.map((pattern, pIdx) => {
            const anchors = getAnchorTexels(pattern, partitionSubsetCount);

            return (
              <div
                key={pIdx}
                className="group flex flex-col items-center rounded-xl border border-slate-800 bg-slate-950 p-2 hover:border-cyan-500/50 hover:bg-slate-900 transition"
              >
                <div className="text-[10px] font-mono text-slate-400 font-bold mb-1">
                  Shape #{pIdx}
                </div>

                <div className="grid grid-cols-4 gap-0.5 p-1 bg-slate-900 rounded-lg border border-slate-800/80 aspect-square w-full">
                  {pattern.map((sub, texelIdx) => {
                    const isAnchor = anchors.includes(texelIdx);
                    return (
                      <div
                        key={texelIdx}
                        className={`relative aspect-square rounded-[3px] flex items-center justify-center text-[7px] font-bold font-mono transition-all ${
                          sub === 0
                            ? "bg-cyan-500/80 text-black"
                            : sub === 1
                            ? "bg-purple-500/80 text-white"
                            : "bg-emerald-500/80 text-black"
                        }`}
                      >
                        {isAnchor && (
                          <span className="text-[8px] text-amber-300 font-black drop-shadow">
                            A
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
