import React, { useState, useMemo } from "react";
import {
  ASTC_FOOTPRINTS,
  ASTC_CEM_SPECS,
  RgbaColor,
  synthesizeAstcBlock,
  AstcBitField,
  AstcBitCategory,
} from "../lib/astc/astcUtils";
import { Sliders, Grid, Layers, Cpu, ShieldCheck, Info, Filter, Binary } from "lucide-react";

export const AstcSandbox: React.FC = () => {
  // 1. Footprint Selection
  const [footprintIndex, setFootprintIndex] = useState<number>(0);
  const selectedFootprint = ASTC_FOOTPRINTS[footprintIndex] || ASTC_FOOTPRINTS[0];

  // 2. Partition Settings
  const [partitionCount, setPartitionCount] = useState<number>(2);
  const [partitionSeed, setPartitionSeed] = useState<number>(102);

  // 3. Dual Plane Settings
  const [dualPlane, setDualPlane] = useState<boolean>(false);
  const [dualPlaneComponent, setDualPlaneComponent] = useState<number>(3); // 3: Alpha

  // 4. Color Endpoint Mode (CEM)
  const [cem, setCem] = useState<number>(12); // LDR Direct RGBA

  // 5. Weight Grid Settings
  const [gridW, setGridW] = useState<number>(4);
  const [gridH, setGridH] = useState<number>(4);
  const [weightMaxVal, setWeightMaxVal] = useState<number>(15); // e.g. 15 for 4-bit (0..15)
  const [activePlaneTab, setActivePlaneTab] = useState<"primary" | "secondary">("primary");

  // 6. Interactive Bit/Byte Stream Inspector Filters & Hover States
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [hoveredByteIdx, setHoveredByteIdx] = useState<number | null>(null);
  const [hoveredBitIdx, setHoveredBitIdx] = useState<number | null>(null);
  const [hoveredField, setHoveredField] = useState<AstcBitField | null>(null);

  // Endpoints state for up to 4 partitions
  const [partitionEndpoints, setPartitionEndpoints] = useState<
    Array<{ ep0: RgbaColor; ep1: RgbaColor }>
  >([
    { ep0: { r: 240, g: 80, b: 60, a: 255 }, ep1: { r: 40, g: 180, b: 240, a: 255 } },
    { ep0: { r: 60, g: 220, b: 100, a: 255 }, ep1: { r: 250, g: 200, b: 40, a: 255 } },
    { ep0: { r: 200, g: 60, b: 220, a: 255 }, ep1: { r: 60, g: 240, b: 200, a: 255 } },
    { ep0: { r: 240, g: 160, b: 40, a: 255 }, ep1: { r: 80, g: 80, b: 80, a: 255 } },
  ]);

  // Primary Texel Weight Grid state
  const [weightsGrid, setWeightsGrid] = useState<number[]>(() => {
    return Array.from({ length: 16 }, (_, i) => Math.round((i / 15) * 15));
  });

  // Secondary Texel Weight Grid state for Dual Plane
  const [alphaWeightsGrid, setAlphaWeightsGrid] = useState<number[]>(() => {
    return Array.from({ length: 16 }, (_, i) => Math.round(((15 - i) / 15) * 15));
  });

  // Handle Footprint Change
  const handleFootprintSelect = (idx: number) => {
    setFootprintIndex(idx);
    setHoveredTexel(null);
    const fp = ASTC_FOOTPRINTS[idx] || ASTC_FOOTPRINTS[0];
    const newW = Math.min(fp.width, 6);
    const newH = Math.min(fp.height, 6);
    handleGridDimChange(newW, newH);
  };

  // Adjust weight grids when grid dimensions change
  const handleGridDimChange = (newW: number, newH: number) => {
    setGridW(newW);
    setGridH(newH);
    const total = newW * newH;
    setWeightsGrid(
      Array.from({ length: total }, (_, i) =>
        Math.round((i / Math.max(1, total - 1)) * weightMaxVal)
      )
    );
    setAlphaWeightsGrid(
      Array.from({ length: total }, (_, i) =>
        Math.round(((total - 1 - i) / Math.max(1, total - 1)) * weightMaxVal)
      )
    );
  };

  const [hoveredTexel, setHoveredTexel] = useState<number | null>(null);

  // Synthesize ASTC Block
  const blockData = useMemo(() => {
    return synthesizeAstcBlock({
      footprint: selectedFootprint,
      partitionCount,
      partitionSeed,
      dualPlane,
      dualPlaneComponent,
      cem,
      gridW,
      gridH,
      weightMaxVal,
      endpointsByPartition: partitionEndpoints,
      weightsGrid,
      alphaWeightsGrid,
    });
  }, [
    selectedFootprint,
    partitionCount,
    partitionSeed,
    dualPlane,
    dualPlaneComponent,
    cem,
    gridW,
    gridH,
    weightMaxVal,
    partitionEndpoints,
    weightsGrid,
    alphaWeightsGrid,
  ]);

  const updateEndpointColor = (
    partIdx: number,
    epType: "ep0" | "ep1",
    channel: "r" | "g" | "b" | "a",
    val: number
  ) => {
    const updated = [...partitionEndpoints];
    if (!updated[partIdx]) {
      updated[partIdx] = {
        ep0: { r: 128, g: 128, b: 128, a: 255 },
        ep1: { r: 255, g: 255, b: 255, a: 255 },
      };
    }
    const currentEp = { ...updated[partIdx][epType] };
    const spec = ASTC_CEM_SPECS[cem] || ASTC_CEM_SPECS[12];

    if (spec.category === "Luma") {
      currentEp.r = val;
      currentEp.g = val;
      currentEp.b = val;
    } else if (spec.category === "Luma+Alpha") {
      if (channel === "r" || channel === "g" || channel === "b") {
        currentEp.r = val;
        currentEp.g = val;
        currentEp.b = val;
      } else {
        currentEp.a = val;
      }
    } else {
      currentEp[channel] = val;
    }

    updated[partIdx] = {
      ...updated[partIdx],
      [epType]: currentEp,
    };
    setPartitionEndpoints(updated);
  };

  const currentCemSpec = ASTC_CEM_SPECS[cem] || ASTC_CEM_SPECS[12];

  // Helper for category styling
  const getCategoryStyles = (category: AstcBitCategory) => {
    switch (category) {
      case "blockMode":
        return {
          bg: "bg-cyan-950/80",
          border: "border-cyan-700/60",
          text: "text-cyan-300",
          badge: "bg-cyan-500 text-black",
          pillActive: "bg-cyan-500 text-black font-bold",
        };
      case "partition":
        return {
          bg: "bg-amber-950/80",
          border: "border-amber-700/60",
          text: "text-amber-300",
          badge: "bg-amber-500 text-black",
          pillActive: "bg-amber-500 text-black font-bold",
        };
      case "cem":
        return {
          bg: "bg-teal-950/80",
          border: "border-teal-700/60",
          text: "text-teal-300",
          badge: "bg-teal-500 text-black",
          pillActive: "bg-teal-500 text-black font-bold",
        };
      case "dualPlane":
        return {
          bg: "bg-emerald-950/80",
          border: "border-emerald-700/60",
          text: "text-emerald-300",
          badge: "bg-emerald-500 text-black",
          pillActive: "bg-emerald-500 text-black font-bold",
        };
      case "endpoints":
        return {
          bg: "bg-rose-950/80",
          border: "border-rose-700/60",
          text: "text-rose-300",
          badge: "bg-rose-500 text-black",
          pillActive: "bg-rose-500 text-black font-bold",
        };
      case "weights":
        return {
          bg: "bg-indigo-950/80",
          border: "border-indigo-700/60",
          text: "text-indigo-300",
          badge: "bg-indigo-500 text-white",
          pillActive: "bg-indigo-500 text-white font-bold",
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Overview Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sliders className="h-5 w-5 text-cyan-400" />
              <span>ASTC 全规格 128-Bit 比特流与 16-Byte Payload 交互沙盒</span>
            </h2>
            <p className="text-xs text-slate-400">
              全规格支持 14 种 Footprint 块尺寸 (4x4 ~ 12x12)、16 种 CEM 端点模式、Procedural 分割区域、Dual-Plane 与直观 16-Byte Payload 剖析
            </p>
          </div>
        </div>

        {/* Footprints Grid Selector */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
            <span>选择 ASTC 2D Footprint 块尺寸 (全 14 种规格)</span>
            <span className="font-mono text-cyan-400 text-[11px]">
              当前: {selectedFootprint.name} ({selectedFootprint.bpp} bpp)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
            {ASTC_FOOTPRINTS.map((fp, idx) => {
              const isSelected = footprintIndex === idx;
              return (
                <button
                  key={fp.name}
                  onClick={() => handleFootprintSelect(idx)}
                  className={`rounded-xl p-2.5 text-left border transition ${
                    isSelected
                      ? "bg-cyan-500/20 border-cyan-400 ring-1 ring-cyan-400/50"
                      : "bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs font-bold ${
                        isSelected ? "text-cyan-300" : "text-white"
                      }`}
                    >
                      {fp.name}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                        isSelected
                          ? "bg-cyan-400 text-black"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {fp.bpp} bpp
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {fp.width} &times; {fp.height} = {fp.width * fp.height} Texels
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footprint Specifications Summary */}
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="font-bold text-cyan-400">Footprint {selectedFootprint.name}:</span>{" "}
            <span className="text-slate-300">
              {selectedFootprint.width} &times; {selectedFootprint.height} 像素 ({selectedFootprint.width * selectedFootprint.height} Texels / Block)
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px] text-slate-400">
            <span>固定容量: <strong className="text-white">128 Bits (16 Bytes)</strong></span>
            <span>压缩率: <strong className="text-emerald-300">{selectedFootprint.bpp} bpp</strong></span>
            <span>Texel Grid: <strong className="text-amber-300">{gridW} &times; {gridH}</strong></span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Partition & Dual Plane Controls */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Grid className="h-4 w-4 text-cyan-400" />
              <span>分割区域 (Partitions) 与 Dual-Plane 双权值模式</span>
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Partitions Selector */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">Partition Count (1..4)</span>
                  <span className="font-mono text-cyan-400 font-bold">{partitionCount} Partitions</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPartitionCount(p)}
                      className={`flex-1 rounded-lg py-1 text-xs font-bold transition border ${
                        partitionCount === p
                          ? "bg-cyan-500 text-black border-cyan-400"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {partitionCount > 1 && (
                  <div className="space-y-1 border-t border-slate-900 pt-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Partition Seed (0..1023):</span>
                      <span className="font-mono text-amber-300 font-bold">#{partitionSeed}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1023}
                      value={partitionSeed}
                      onChange={(e) => setPartitionSeed(parseInt(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* Dual Plane Controls */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">Dual-Plane Mode</span>
                  <button
                    onClick={() => setDualPlane(!dualPlane)}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-bold transition ${
                      dualPlane
                        ? "bg-emerald-500 text-black"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {dualPlane ? "已开启 (ON)" : "已关闭 (OFF)"}
                  </button>
                </div>

                {dualPlane && (
                  <div className="space-y-1.5 border-t border-slate-900 pt-2 text-xs">
                    <span className="text-[11px] text-slate-400">选择独立权值通道:</span>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { id: 0, name: "R" },
                        { id: 1, name: "G" },
                        { id: 2, name: "B" },
                        { id: 3, name: "A (Alpha)" },
                      ].map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setDualPlaneComponent(c.id)}
                          className={`rounded py-1 text-[11px] font-bold transition border ${
                            dualPlaneComponent === c.id
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                              : "bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300"
                          }`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Color Endpoint Mode (CEM 0..15) & Endpoints sliders */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Color Endpoint Mode (CEM 0..15 全规格)
                </h3>
                <p className="text-[11px] text-slate-400">
                  {currentCemSpec.description} (Category: <span className="text-cyan-300 font-bold">{currentCemSpec.category}</span>)
                </p>
              </div>

              <select
                value={cem}
                onChange={(e) => setCem(parseInt(e.target.value))}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none font-semibold"
              >
                {Object.values(ASTC_CEM_SPECS).map((spec) => (
                  <option key={spec.cem} value={spec.cem}>
                    CEM {spec.cem}: {spec.name} ({spec.numValues} Values)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: partitionCount }).map((_, pIdx) => {
                const epData = partitionEndpoints[pIdx] || {
                  ep0: { r: 128, g: 128, b: 128, a: 255 },
                  ep1: { r: 255, g: 255, b: 255, a: 255 },
                };

                const cat = currentCemSpec.category;

                return (
                  <div
                    key={pIdx}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-900 pb-1.5">
                      <span>Partition #{pIdx} 端点对</span>
                      <div className="flex gap-1.5">
                        <div
                          className="h-4 w-6 rounded border border-white/20 shadow-inner"
                          style={{
                            backgroundColor: `rgba(${epData.ep0.r}, ${epData.ep0.g}, ${epData.ep0.b}, ${epData.ep0.a / 255})`,
                          }}
                          title="EP 0"
                        />
                        <div
                          className="h-4 w-6 rounded border border-white/20 shadow-inner"
                          style={{
                            backgroundColor: `rgba(${epData.ep1.r}, ${epData.ep1.g}, ${epData.ep1.b}, ${epData.ep1.a / 255})`,
                          }}
                          title="EP 1"
                        />
                      </div>
                    </div>

                    {/* EP0 Sliders */}
                    <div className="space-y-1 text-[11px]">
                      <div className="text-[10px] text-cyan-400 font-bold">Endpoint 0:</div>
                      {cat === "Luma" && (
                        <div className="grid grid-cols-1 gap-1">
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep0.r}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep0", "r", parseInt(e.target.value))
                            }
                            className="accent-cyan-500"
                            title="Luma"
                          />
                        </div>
                      )}

                      {cat === "Luma+Alpha" && (
                        <div className="grid grid-cols-2 gap-1">
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep0.r}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep0", "r", parseInt(e.target.value))
                            }
                            className="accent-cyan-500"
                            title="Luma"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep0.a}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep0", "a", parseInt(e.target.value))
                            }
                            className="accent-amber-500"
                            title="Alpha"
                          />
                        </div>
                      )}

                      {(cat === "RGB" || cat === "HDR") && (
                        <div className="grid grid-cols-3 gap-1">
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep0.r}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep0", "r", parseInt(e.target.value))
                            }
                            className="accent-red-500"
                            title="Red"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep0.g}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep0", "g", parseInt(e.target.value))
                            }
                            className="accent-emerald-500"
                            title="Green"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep0.b}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep0", "b", parseInt(e.target.value))
                            }
                            className="accent-blue-500"
                            title="Blue"
                          />
                        </div>
                      )}

                      {cat === "RGBA" && (
                        <div className="grid grid-cols-4 gap-1">
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep0.r}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep0", "r", parseInt(e.target.value))
                            }
                            className="accent-red-500"
                            title="Red"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep0.g}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep0", "g", parseInt(e.target.value))
                            }
                            className="accent-emerald-500"
                            title="Green"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep0.b}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep0", "b", parseInt(e.target.value))
                            }
                            className="accent-blue-500"
                            title="Blue"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep0.a}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep0", "a", parseInt(e.target.value))
                            }
                            className="accent-amber-500"
                            title="Alpha"
                          />
                        </div>
                      )}
                    </div>

                    {/* EP1 Sliders */}
                    <div className="space-y-1 text-[11px] pt-1 border-t border-slate-900">
                      <div className="text-[10px] text-purple-400 font-bold">Endpoint 1:</div>
                      {cat === "Luma" && (
                        <div className="grid grid-cols-1 gap-1">
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep1.r}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep1", "r", parseInt(e.target.value))
                            }
                            className="accent-cyan-500"
                            title="Luma"
                          />
                        </div>
                      )}

                      {cat === "Luma+Alpha" && (
                        <div className="grid grid-cols-2 gap-1">
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep1.r}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep1", "r", parseInt(e.target.value))
                            }
                            className="accent-cyan-500"
                            title="Luma"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep1.a}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep1", "a", parseInt(e.target.value))
                            }
                            className="accent-amber-500"
                            title="Alpha"
                          />
                        </div>
                      )}

                      {(cat === "RGB" || cat === "HDR") && (
                        <div className="grid grid-cols-3 gap-1">
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep1.r}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep1", "r", parseInt(e.target.value))
                            }
                            className="accent-red-500"
                            title="Red"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep1.g}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep1", "g", parseInt(e.target.value))
                            }
                            className="accent-emerald-500"
                            title="Green"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep1.b}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep1", "b", parseInt(e.target.value))
                            }
                            className="accent-blue-500"
                            title="Blue"
                          />
                        </div>
                      )}

                      {cat === "RGBA" && (
                        <div className="grid grid-cols-4 gap-1">
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep1.r}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep1", "r", parseInt(e.target.value))
                            }
                            className="accent-red-500"
                            title="Red"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep1.g}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep1", "g", parseInt(e.target.value))
                            }
                            className="accent-emerald-500"
                            title="Green"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep1.b}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep1", "b", parseInt(e.target.value))
                            }
                            className="accent-blue-500"
                            title="Blue"
                          />
                          <input
                            type="range"
                            min={0}
                            max={255}
                            value={epData.ep1.a}
                            onChange={(e) =>
                              updateEndpointColor(pIdx, "ep1", "a", parseInt(e.target.value))
                            }
                            className="accent-amber-500"
                            title="Alpha"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Texel Weight Grid Sliders */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Texel Weight Grid ({gridW} &times; {gridH})
                </h3>
                {dualPlane && (
                  <div className="flex rounded bg-slate-950 p-0.5 border border-slate-800 text-[10px]">
                    <button
                      onClick={() => setActivePlaneTab("primary")}
                      className={`px-2 py-0.5 rounded font-bold transition ${
                        activePlaneTab === "primary"
                          ? "bg-cyan-500 text-black"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Plane 1 (RGB)
                    </button>
                    <button
                      onClick={() => setActivePlaneTab("secondary")}
                      className={`px-2 py-0.5 rounded font-bold transition ${
                        activePlaneTab === "secondary"
                          ? "bg-emerald-500 text-black"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Plane 2 ({["R", "G", "B", "Alpha"][dualPlaneComponent]})
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Grid Dim:</span>
                  <select
                    value={`${gridW}x${gridH}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split("x").map(Number);
                      handleGridDimChange(w, h);
                    }}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs text-slate-200"
                  >
                    <option value="2x2">2x2</option>
                    <option value="3x3">3x3</option>
                    <option value="4x4">4x4</option>
                    <option value="5x5">5x5</option>
                    <option value="6x6">6x6</option>
                    <option value="8x8">8x8</option>
                    <option value="12x12">12x12</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Quant Level:</span>
                  <select
                    value={weightMaxVal}
                    onChange={(e) => setWeightMaxVal(parseInt(e.target.value))}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs text-slate-200"
                  >
                    <option value={1}>2 Levels (1 Bit)</option>
                    <option value={3}>4 Levels (2 Bits)</option>
                    <option value={7}>8 Levels (3 Bits)</option>
                    <option value={15}>16 Levels (4 Bits)</option>
                    <option value={31}>32 Levels (5 Bits)</option>
                  </select>
                </div>
              </div>
            </div>

            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${gridW}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: gridW * gridH }).map((_, i) => {
                const isSec = dualPlane && activePlaneTab === "secondary";
                const targetGrid = isSec ? alphaWeightsGrid : weightsGrid;
                const setTargetGrid = isSec ? setAlphaWeightsGrid : setWeightsGrid;
                const wVal = targetGrid[i] ?? 0;

                return (
                  <div
                    key={i}
                    className={`rounded-lg bg-slate-950 p-2 border text-center ${
                      isSec ? "border-emerald-900/50" : "border-slate-800"
                    }`}
                  >
                    <div className="text-[10px] text-slate-400 font-mono">Grid #{i}</div>
                    <input
                      type="range"
                      min={0}
                      max={weightMaxVal}
                      value={Math.min(wVal, weightMaxVal)}
                      onChange={(e) => {
                        const updated = [...targetGrid];
                        updated[i] = parseInt(e.target.value);
                        setTargetGrid(updated);
                      }}
                      className={`w-full ${isSec ? "accent-emerald-500" : "accent-cyan-500"}`}
                    />
                    <div
                      className={`text-xs font-bold font-mono ${
                        isSec ? "text-emerald-400" : "text-cyan-400"
                      }`}
                    >
                      {wVal}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Output Canvas & 128-Bit Payload Stream Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Canvas Rendering Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>合成 ASTC {selectedFootprint.name} Texel Grid 效果</span>
              <span className="text-xs font-mono font-normal text-slate-400">
                {selectedFootprint.width} &times; {selectedFootprint.height} Texels
              </span>
            </h3>

            {/* Canvas grid rendering */}
            <div
              className="grid gap-1 p-3 bg-slate-950 rounded-2xl border border-slate-800 aspect-square overflow-hidden"
              style={{ gridTemplateColumns: `repeat(${selectedFootprint.width}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: selectedFootprint.width * selectedFootprint.height }).map(
                (_, idx) => {
                  const r = blockData.texelRgba[idx * 4 + 0];
                  const g = blockData.texelRgba[idx * 4 + 1];
                  const b = blockData.texelRgba[idx * 4 + 2];
                  const a = blockData.texelRgba[idx * 4 + 3];
                  const part = blockData.partitionMap[idx];

                  const isHovered = hoveredTexel === idx;
                  const showDetailedLabels = selectedFootprint.width <= 6;

                  return (
                    <div
                      key={idx}
                      onMouseEnter={() => setHoveredTexel(idx)}
                      onMouseLeave={() => setHoveredTexel(null)}
                      style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${a / 255})` }}
                      className={`relative aspect-square rounded-md border shadow-inner flex flex-col justify-between p-0.5 transition ${
                        isHovered
                          ? "border-amber-400 ring-2 ring-amber-400/50 scale-105 z-10"
                          : "border-slate-800/80"
                      }`}
                    >
                      {showDetailedLabels && (
                        <>
                          <span className="text-[8px] text-white/80 font-mono font-bold bg-black/40 px-0.5 rounded w-fit">
                            #{idx}
                          </span>
                          <div className="text-[7px] text-cyan-200 font-mono text-right bg-black/50 p-0.5 rounded leading-tight">
                            <div>P:{part}</div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                }
              )}
            </div>

            {/* Hovered Texel Inspection Box */}
            {hoveredTexel !== null && (
              <div className="rounded-xl bg-slate-950 p-3 border border-amber-500/40 text-xs space-y-1 animate-fadeIn">
                <div className="font-bold text-amber-300 flex items-center justify-between">
                  <span>Texel #{hoveredTexel} 详细解包数据:</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    Partition {blockData.partitionMap[hoveredTexel]}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    RGBA:{" "}
                    <strong className="text-cyan-300">
                      ({blockData.texelRgba[hoveredTexel * 4 + 0]},{" "}
                      {blockData.texelRgba[hoveredTexel * 4 + 1]},{" "}
                      {blockData.texelRgba[hoveredTexel * 4 + 2]},{" "}
                      {blockData.texelRgba[hoveredTexel * 4 + 3]})
                    </strong>
                  </div>
                  <div>
                    Partition: <strong className="text-amber-300">#{blockData.partitionMap[hoveredTexel]}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 16-Byte Payload Stream & 128-Bit Visualizer */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Binary className="h-4 w-4 text-cyan-400" />
                  <span>16-Byte Payload Stream (128-Bit 比特流直观剖析)</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  ASTC 块二进制内存映像与字段对应分布
                </p>
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap gap-1 text-[10px]">
                {[
                  { id: "all", label: "ALL" },
                  { id: "blockMode", label: "BLOCK MODE" },
                  { id: "partition", label: "PARTITION" },
                  { id: "cem", label: "CEM" },
                  { id: "endpoints", label: "ENDPOINTS" },
                  { id: "weights", label: "WEIGHTS" },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setCategoryFilter(f.id)}
                    className={`px-2 py-0.5 rounded font-bold transition ${
                      categoryFilter === f.id
                        ? "bg-cyan-500 text-black"
                        : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 16-Byte Grid Stream Stream Display */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>16 字节 Memory Payload 视角 (Bytes 0..15)</span>
                <span className="font-mono text-[10px] text-cyan-300">
                  128 Bits / 16 Bytes Fixed
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {Array.from({ length: 16 }).map((_, bIdx) => {
                  const val = blockData.rawBytes[bIdx] || 0;
                  const hex = val.toString(16).padStart(2, "0").toUpperCase();
                  const bin = val.toString(2).padStart(8, "0");

                  // Determine byte role tag
                  let roleTag = "Payload";
                  let roleColor = "text-slate-400 bg-slate-900";
                  if (bIdx === 0) {
                    roleTag = "BlockMode";
                    roleColor = "text-cyan-300 bg-cyan-950/80 border-cyan-800/60";
                  } else if (bIdx === 1) {
                    roleTag = "Mode/Part";
                    roleColor = "text-amber-300 bg-amber-950/80 border-amber-800/60";
                  } else if (bIdx === 2) {
                    roleTag = "Seed";
                    roleColor = "text-purple-300 bg-purple-950/80 border-purple-800/60";
                  } else if (bIdx === 3) {
                    roleTag = "CEM/Dual";
                    roleColor = "text-teal-300 bg-teal-950/80 border-teal-800/60";
                  } else if (bIdx < 10) {
                    roleTag = "EP/Weight";
                    roleColor = "text-rose-300 bg-rose-950/80 border-rose-800/60";
                  } else {
                    roleTag = "Weights";
                    roleColor = "text-indigo-300 bg-indigo-950/80 border-indigo-800/60";
                  }

                  const startBit = bIdx * 8;
                  const endBit = startBit + 7;
                  const isHoveredByte =
                    hoveredByteIdx === bIdx ||
                    (hoveredBitIdx !== null && hoveredBitIdx >= startBit && hoveredBitIdx <= endBit);

                  return (
                    <div
                      key={bIdx}
                      onMouseEnter={() => setHoveredByteIdx(bIdx)}
                      onMouseLeave={() => setHoveredByteIdx(null)}
                      className={`rounded-xl bg-slate-950 p-2 border transition cursor-pointer flex flex-col justify-between ${
                        isHoveredByte
                          ? "border-cyan-400 ring-2 ring-cyan-400/50 scale-105 z-10"
                          : "border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                        <span>B#{bIdx}</span>
                        <span className={`px-1 py-0.2 rounded text-[8px] border ${roleColor}`}>
                          {roleTag}
                        </span>
                      </div>

                      <div className="text-center font-mono my-1">
                        <div className="text-xs font-bold text-cyan-300">0x{hex}</div>
                        <div className="text-[8px] text-slate-400">{val}</div>
                      </div>

                      <div className="text-[7px] font-mono text-slate-500 text-center tracking-tighter truncate">
                        {bin}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 128-Bit Stream Matrix Visualizer */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Bit 0 (LSB) &rarr;</span>
                <span>Bit 127 (MSB, Reverse Stream)</span>
              </div>

              <div className="grid grid-cols-16 gap-1 p-2 bg-slate-950 rounded-xl border border-slate-800">
                {Array.from({ length: 128 }).map((_, bitIdx) => {
                  const bitVal = blockData.binaryStream[bitIdx] || "0";
                  const ownerField = blockData.bitFields.find(
                    (f) => bitIdx >= f.startBit && bitIdx < f.startBit + f.length
                  );

                  const cat = ownerField?.category || "weights";
                  const catStyle = getCategoryStyles(cat);

                  const isFiltered =
                    categoryFilter !== "all" && ownerField?.category !== categoryFilter;

                  const isHoveredBit =
                    hoveredBitIdx === bitIdx ||
                    (hoveredField &&
                      bitIdx >= hoveredField.startBit &&
                      bitIdx < hoveredField.startBit + hoveredField.length) ||
                    (hoveredByteIdx !== null && Math.floor(bitIdx / 8) === hoveredByteIdx);

                  return (
                    <div
                      key={bitIdx}
                      onMouseEnter={() => {
                        setHoveredBitIdx(bitIdx);
                        if (ownerField) setHoveredField(ownerField);
                      }}
                      onMouseLeave={() => {
                        setHoveredBitIdx(null);
                        setHoveredField(null);
                      }}
                      className={`relative flex aspect-square flex-col items-center justify-center rounded text-[9px] font-mono cursor-pointer transition-all ${
                        isHoveredBit
                          ? "ring-2 ring-amber-400 scale-125 z-20 shadow-lg bg-amber-400 text-black font-bold"
                          : isFiltered
                          ? "opacity-20 bg-slate-900 border-slate-800 text-slate-600"
                          : `${catStyle.bg} ${catStyle.border} ${catStyle.text} border`
                      }`}
                      title={`Bit #${bitIdx}: ${ownerField ? ownerField.name : "Reserved"} (${bitVal})`}
                    >
                      {bitVal}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hover Bit/Field Inspection Box */}
            {hoveredField && (
              <div className="rounded-xl bg-slate-950 p-3 border border-cyan-500/40 text-xs space-y-1 animate-fadeIn">
                <div className="font-bold text-cyan-300 flex items-center justify-between">
                  <span>{hoveredField.name}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getCategoryStyles(hoveredField.category).badge}`}>
                    {hoveredField.category.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                  <div>
                    Bit Range:{" "}
                    <strong className="text-amber-300">
                      [{hoveredField.startBit}..{hoveredField.startBit + hoveredField.length - 1}] ({hoveredField.length} bits)
                    </strong>
                  </div>
                  <div>
                    Decoded Value: <strong className="text-emerald-300">{hoveredField.value}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* 128-Bit Layout Breakdown Table */}
            <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 space-y-2">
              <div className="text-xs font-bold text-white flex items-center justify-between">
                <span>ASTC 128-Bit 字段布局剖析表</span>
                <span className="text-[10px] text-slate-400 font-mono">128 bits fixed</span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 pr-1 text-[10px] font-mono">
                {blockData.bitFields.map((field, fIdx) => {
                  const style = getCategoryStyles(field.category);
                  const isHovered = hoveredField === field;

                  return (
                    <div
                      key={fIdx}
                      onMouseEnter={() => setHoveredField(field)}
                      onMouseLeave={() => setHoveredField(null)}
                      className={`flex items-center justify-between rounded px-2 py-1 border transition cursor-pointer ${
                        isHovered
                          ? "bg-cyan-500/20 border-cyan-400 text-white"
                          : "bg-slate-900/80 border-slate-800/80"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${style.badge}`}>
                          {field.category.toUpperCase()}
                        </span>
                        <span className="text-cyan-300 font-bold">{field.name}</span>
                      </div>
                      <span className="text-slate-400">
                        [{field.startBit}..{field.startBit + field.length - 1}] ({field.length}b) ={" "}
                        <strong className="text-amber-300">{field.value}</strong>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
