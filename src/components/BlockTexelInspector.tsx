import React, { useState, useMemo } from "react";
import { decodeBC7Block, BitField, DecodedBC7Block } from "../lib/bc7/bc7Decoder";
import { encodeBC7Block } from "../lib/bc7/bc7Encoder";
import { BC7_MODE_SPECS } from "../lib/bc7/bc7Tables";
import { Sparkles, Info, RefreshCw, CheckCircle2, ChevronRight, Layers, HelpCircle } from "lucide-react";

interface BlockTexelInspectorProps {
  onAnalyzeWithAI?: (decoded: DecodedBC7Block, origTexels: Uint8ClampedArray) => void;
}

// Preset 4x4 Blocks
const PRESET_BLOCKS = [
  {
    name: "平滑色彩渐变 (Smooth Gradient)",
    texels: (() => {
      const arr = new Uint8ClampedArray(64);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const idx = (y * 4 + x) * 4;
          arr[idx] = Math.round((x / 3) * 200 + 30);
          arr[idx + 1] = Math.round((y / 3) * 180 + 40);
          arr[idx + 2] = Math.round(((x + y) / 6) * 220 + 20);
          arr[idx + 3] = 255;
        }
      }
      return arr;
    })(),
  },
  {
    name: "双向斜向边缘 (Dual Color Edge)",
    texels: (() => {
      const arr = new Uint8ClampedArray(64);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const idx = (y * 4 + x) * 4;
          const isA = x + y < 3;
          arr[idx] = isA ? 230 : 20;
          arr[idx + 1] = isA ? 50 : 180;
          arr[idx + 2] = isA ? 90 : 220;
          arr[idx + 3] = 255;
        }
      }
      return arr;
    })(),
  },
  {
    name: "透明度边缘 (Alpha Cutout Fringe)",
    texels: (() => {
      const arr = new Uint8ClampedArray(64);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const idx = (y * 4 + x) * 4;
          const dist = Math.sqrt((x - 1.5) ** 2 + (y - 1.5) ** 2);
          arr[idx] = 255;
          arr[idx + 1] = 160;
          arr[idx + 2] = 40;
          arr[idx + 3] = dist < 1.2 ? 255 : dist < 1.8 ? 120 : 0;
        }
      }
      return arr;
    })(),
  },
  {
    name: "法线贴图方向 (Normal Vector)",
    texels: (() => {
      const arr = new Uint8ClampedArray(64);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const idx = (y * 4 + x) * 4;
          arr[idx] = 128 + x * 20;
          arr[idx + 1] = 128 + y * 20;
          arr[idx + 2] = 240;
          arr[idx + 3] = 255;
        }
      }
      return arr;
    })(),
  },
];

export const BlockTexelInspector: React.FC<BlockTexelInspectorProps> = ({ onAnalyzeWithAI }) => {
  const [selectedTexels, setSelectedTexels] = useState<Uint8ClampedArray>(PRESET_BLOCKS[0].texels);
  const [activeTexelIdx, setActiveTexelIdx] = useState<number | null>(0);
  const [hoveredBitField, setHoveredBitField] = useState<BitField | null>(null);
  const [hoveredTexelIdx, setHoveredTexelIdx] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [aiAnalysisText, setAiAnalysisText] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  // Encode 4x4 texels to 16-byte BC7 payload
  const encodedPayload = useMemo(() => {
    return encodeBC7Block(selectedTexels, { quality: "best" });
  }, [selectedTexels]);

  // Decode 16-byte payload to get decoded texels & bit breakdown
  const decoded = useMemo(() => {
    return decodeBC7Block(encodedPayload);
  }, [encodedPayload]);

  // Calculate MSE & PSNR for this 4x4 block
  const { mse, psnr } = useMemo(() => {
    let diffSq = 0;
    for (let i = 0; i < 64; i++) {
      const delta = selectedTexels[i] - decoded.rgbaTexels[i];
      diffSq += delta * delta;
    }
    const mseVal = diffSq / 64;
    const psnrVal = mseVal === 0 ? 99.99 : 10 * Math.log10((255 * 255) / mseVal);
    return { mse: mseVal, psnr: psnrVal };
  }, [selectedTexels, decoded]);

  // Color component modifier for active texel
  const updateActiveTexelColor = (channel: 0 | 1 | 2 | 3, value: number) => {
    if (activeTexelIdx === null) return;
    const newTexels = new Uint8ClampedArray(selectedTexels);
    newTexels[activeTexelIdx * 4 + channel] = value;
    setSelectedTexels(newTexels);
  };

  // AI analysis request handler
  const handleAIExplain = async () => {
    setLoadingAI(true);
    setAiAnalysisText(null);
    try {
      const res = await fetch("/api/gemini/explain-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: decoded.mode,
          partition: decoded.partition,
          endpoints: decoded.endpoints,
          pbits: decoded.pBits,
          rotation: decoded.rotation,
          indices: decoded.texelWeights,
          texels: Array.from(selectedTexels),
          psnr,
        }),
      });
      const data = await res.json();
      if (data.text) {
        setAiAnalysisText(data.text);
      } else {
        setAiAnalysisText("无法获取 AI 分析。请确认 GEMINI_API_KEY 已配置。");
      }
    } catch (err: any) {
      setAiAnalysisText(`请求失败: ${err.message}`);
    } finally {
      setLoadingAI(false);
    }
  };

  const modeSpec = BC7_MODE_SPECS[decoded.mode];

  // Bit field category badge styling
  const getCategoryColor = (cat: BitField["category"]) => {
    switch (cat) {
      case "mode":
        return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
      case "partition":
        return "bg-purple-500/20 text-purple-300 border-purple-500/40";
      case "endpoint":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
      case "pbit":
        return "bg-amber-500/20 text-amber-300 border-amber-500/40";
      case "rotation":
      case "idxmode":
        return "bg-blue-500/20 text-blue-300 border-blue-500/40";
      case "indices":
        return "bg-rose-500/20 text-rose-300 border-rose-500/40";
      default:
        return "bg-slate-700 text-slate-300 border-slate-600";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Preset Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>4x4 块比特级剖析器 (128-Bit Payload Inspector)</span>
            <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-semibold text-cyan-400">
              Mode {decoded.mode}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            点击或调整任意 4x4 像素，实时观察 16 字节 (128 比特) BC7 二进制流的位分配与解包过程
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400 font-medium">加载预设块:</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_BLOCKS.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setSelectedTexels(preset.texels);
                  setActiveTexelIdx(0);
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-500/50 hover:bg-slate-700 transition"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Grid: Left Canvas & Right Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: 4x4 Editors & Compression Metrics */}
        <div className="lg:col-span-5 space-y-6">
          {/* Original vs BC7 Decoded Comparison Canvas */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center justify-between">
              <span>原始 4x4 RGBA vs BC7 解压 4x4</span>
              <span className="text-xs font-normal text-slate-500">（点击像素调色）</span>
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Original 4x4 Grid */}
              <div className="space-y-2">
                <div className="text-center text-xs font-semibold text-slate-400">原始 4x4 像素</div>
                <div className="grid grid-cols-4 gap-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800">
                  {Array.from({ length: 16 }).map((_, i) => {
                    const r = selectedTexels[i * 4];
                    const g = selectedTexels[i * 4 + 1];
                    const b = selectedTexels[i * 4 + 2];
                    const a = selectedTexels[i * 4 + 3];
                    const isSelected = activeTexelIdx === i;
                    const isHovered = hoveredTexelIdx === i;
                    const subset = decoded.partitionPattern[i];

                    return (
                      <button
                        key={i}
                        onClick={() => setActiveTexelIdx(i)}
                        onMouseEnter={() => setHoveredTexelIdx(i)}
                        onMouseLeave={() => setHoveredTexelIdx(null)}
                        style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${a / 255})` }}
                        className={`group relative aspect-square rounded-lg border text-[10px] font-mono transition-all ${
                          isSelected
                            ? "border-cyan-400 ring-2 ring-cyan-500/50 scale-105 z-10"
                            : isHovered
                            ? "border-white scale-100 z-10"
                            : "border-slate-800/80"
                        }`}
                      >
                        <span className="absolute top-0.5 left-1 text-[8px] opacity-70 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] text-white">
                          #{i}
                        </span>
                        {decoded.numSubsets > 1 && (
                          <span
                            className={`absolute bottom-0.5 right-1 rounded px-0.5 text-[8px] font-bold ${
                              subset === 0
                                ? "bg-cyan-500/80 text-black"
                                : subset === 1
                                ? "bg-purple-500/80 text-white"
                                : "bg-emerald-500/80 text-black"
                            }`}
                          >
                            S{subset}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* BC7 Decoded 4x4 Grid */}
              <div className="space-y-2">
                <div className="text-center text-xs font-semibold text-cyan-400">BC7 解压像素</div>
                <div className="grid grid-cols-4 gap-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800">
                  {Array.from({ length: 16 }).map((_, i) => {
                    const r = decoded.rgbaTexels[i * 4];
                    const g = decoded.rgbaTexels[i * 4 + 1];
                    const b = decoded.rgbaTexels[i * 4 + 2];
                    const a = decoded.rgbaTexels[i * 4 + 3];
                    const isHovered = hoveredTexelIdx === i;

                    return (
                      <div
                        key={i}
                        style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${a / 255})` }}
                        className={`relative aspect-square rounded-lg border text-[10px] font-mono transition-all ${
                          isHovered ? "border-cyan-400 scale-105 z-10 shadow-lg" : "border-slate-800/80"
                        }`}
                      >
                        <span className="absolute top-0.5 left-1 text-[8px] opacity-70 text-white drop-shadow">
                          #{i}
                        </span>
                        <span className="absolute bottom-0.5 right-1 text-[8px] opacity-80 text-cyan-200 font-mono">
                          w:{decoded.texelWeights[i]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Active Texel Color Slider */}
            {activeTexelIdx !== null && (
              <div className="mt-4 rounded-xl bg-slate-950 p-3 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                  <span>编辑像素 #{activeTexelIdx} RGBA</span>
                  <span className="font-mono text-cyan-400">
                    R:{selectedTexels[activeTexelIdx * 4]} G:{selectedTexels[activeTexelIdx * 4 + 1]} B:
                    {selectedTexels[activeTexelIdx * 4 + 2]} A:{selectedTexels[activeTexelIdx * 4 + 3]}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center space-x-2 text-[11px] text-red-400">
                    <span className="w-4 font-mono">R</span>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      value={selectedTexels[activeTexelIdx * 4]}
                      onChange={(e) => updateActiveTexelColor(0, parseInt(e.target.value))}
                      className="w-full accent-red-500"
                    />
                  </label>
                  <label className="flex items-center space-x-2 text-[11px] text-emerald-400">
                    <span className="w-4 font-mono">G</span>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      value={selectedTexels[activeTexelIdx * 4 + 1]}
                      onChange={(e) => updateActiveTexelColor(1, parseInt(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </label>
                  <label className="flex items-center space-x-2 text-[11px] text-blue-400">
                    <span className="w-4 font-mono">B</span>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      value={selectedTexels[activeTexelIdx * 4 + 2]}
                      onChange={(e) => updateActiveTexelColor(2, parseInt(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </label>
                  <label className="flex items-center space-x-2 text-[11px] text-slate-300">
                    <span className="w-4 font-mono">A</span>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      value={selectedTexels[activeTexelIdx * 4 + 3]}
                      onChange={(e) => updateActiveTexelColor(3, parseInt(e.target.value))}
                      className="w-full accent-slate-400"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Block Level Metrics */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">当前 4x4 块画质指标与硬件状态</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 text-center">
                <div className="text-[10px] text-slate-400">PSNR 信噪比</div>
                <div className="text-base font-bold text-cyan-400 font-mono mt-0.5">
                  {psnr.toFixed(2)} dB
                </div>
              </div>
              <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 text-center">
                <div className="text-[10px] text-slate-400">MSE 均方误差</div>
                <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                  {mse.toFixed(2)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 text-center">
                <div className="text-[10px] text-slate-400">负载大小</div>
                <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                  16 Bytes
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-cyan-950/30 p-3 border border-cyan-800/40 text-xs text-cyan-200/90 leading-relaxed">
              <span className="font-semibold text-cyan-300">Mode {decoded.mode} 特性:</span>{" "}
              {modeSpec.description}
            </div>

            {/* AI Explain Block Button */}
            <button
              onClick={handleAIExplain}
              disabled={loadingAI}
              className="w-full flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-500 hover:to-blue-500 transition disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              <span>{loadingAI ? "AI 正在剖析算法编码决策..." : "请求 Gemini AI 深度诊断此 4x4 块"}</span>
            </button>

            {aiAnalysisText && (
              <div className="rounded-xl bg-slate-950 p-4 border border-cyan-500/30 text-xs text-slate-200 leading-relaxed space-y-2">
                <div className="font-bold text-cyan-400 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Gemini AI 专家剖析报告</span>
                </div>
                <div className="whitespace-pre-wrap font-sans text-slate-300 text-[11px] leading-normal">
                  {aiAnalysisText}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 128-Bit Memory Payload Inspector */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>128-Bit 二进制内存映像 (16-Byte Payload Stream)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  十六进制: <code className="font-mono text-cyan-300 bg-slate-950 px-2 py-0.5 rounded">{decoded.hexPayload}</code>
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-1">
                {["all", "mode", "partition", "endpoint", "pbit", "indices"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                      categoryFilter === cat
                        ? "bg-cyan-500 text-black font-bold"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {cat.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Bit-by-Bit Visual Stream Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Bit 0 (LSB) &rarr;</span>
                <span>Bit 127 (MSB)</span>
              </div>

              <div className="grid grid-cols-16 gap-1 p-3 bg-slate-950 rounded-xl border border-slate-800">
                {Array.from({ length: 128 }).map((_, bitIdx) => {
                  const bitVal = decoded.binaryStream[bitIdx] || "0";
                  // Find field owning this bit
                  const ownerField = decoded.bitMap.find(
                    (f) => bitIdx >= f.startBit && bitIdx < f.startBit + f.length
                  );

                  const isFiltered =
                    categoryFilter !== "all" && ownerField?.category !== categoryFilter;

                  const isHoveredBit =
                    hoveredBitField &&
                    bitIdx >= hoveredBitField.startBit &&
                    bitIdx < hoveredBitField.startBit + hoveredBitField.length;

                  return (
                    <div
                      key={bitIdx}
                      onMouseEnter={() => ownerField && setHoveredBitField(ownerField)}
                      onMouseLeave={() => setHoveredBitField(null)}
                      className={`relative flex aspect-[2/3] flex-col items-center justify-center rounded text-[10px] font-mono cursor-pointer transition-all ${
                        isHoveredBit
                          ? "ring-2 ring-white scale-110 z-20 shadow-lg"
                          : isFiltered
                          ? "opacity-20 bg-slate-900 border-slate-800 text-slate-600"
                          : ownerField
                          ? getCategoryColor(ownerField.category) + " border"
                          : "bg-slate-900 text-slate-500 border-slate-800"
                      }`}
                      title={ownerField ? `${ownerField.name}: Bit ${bitIdx}` : `Bit ${bitIdx}`}
                    >
                      <span className="text-[7px] opacity-60">{bitIdx}</span>
                      <span className="font-bold text-[11px]">{bitVal}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hovered Bit Field Detailed Breakdown Box */}
            {hoveredBitField ? (
              <div className="rounded-xl border border-cyan-500/50 bg-slate-950 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between text-cyan-300 font-bold">
                  <span>{hoveredBitField.name}</span>
                  <span className="font-mono text-[11px]">
                    Bit Range: {hoveredBitField.startBit} .. {hoveredBitField.startBit + hoveredBitField.length - 1} ({hoveredBitField.length} bits)
                  </span>
                </div>
                <p className="text-slate-300 text-[11px]">{hoveredBitField.description}</p>
                <div className="text-slate-400 font-mono text-[10px]">
                  Decoded Integer Value: <span className="text-amber-400 font-bold">{hoveredBitField.value}</span> (0b{hoveredBitField.value.toString(2)})
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-500 flex items-center space-x-2">
                <Info className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <span>鼠标悬停在上方任意 Bit 方格上，查看其对应的解包语义、控制端点或权值索引。</span>
              </div>
            )}

            {/* Bit Fields Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                解包数据结构表 (Decoded Bit Fields Table)
              </h4>
              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 text-xs">
                <table className="w-full text-left font-mono">
                  <thead className="sticky top-0 bg-slate-900 text-[11px] text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">字段名称</th>
                      <th className="py-2 px-3">Bit 范围</th>
                      <th className="py-2 px-3">位数</th>
                      <th className="py-2 px-3">数值</th>
                      <th className="py-2 px-3">语义描述</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-[11px]">
                    {decoded.bitMap.map((field, idx) => (
                      <tr
                        key={idx}
                        onMouseEnter={() => setHoveredBitField(field)}
                        onMouseLeave={() => setHoveredBitField(null)}
                        className={`hover:bg-slate-900/80 transition cursor-pointer ${
                          hoveredBitField === field ? "bg-slate-800/80 font-bold text-white" : "text-slate-300"
                        }`}
                      >
                        <td className="py-1.5 px-3">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[9px] border ${getCategoryColor(
                              field.category
                            )}`}
                          >
                            {field.name}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-slate-400">
                          {field.startBit}..{field.startBit + field.length - 1}
                        </td>
                        <td className="py-1.5 px-3 text-slate-400">{field.length}</td>
                        <td className="py-1.5 px-3 font-bold text-cyan-400">{field.value}</td>
                        <td className="py-1.5 px-3 text-slate-400 font-sans">{field.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
