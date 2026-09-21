import React, { useState } from "react";
import { BitSandbox } from "./BitSandbox";
import { AstcSandbox } from "./AstcSandbox";
import { Cpu, Layers, Sparkles, Check, ArrowRightLeft } from "lucide-react";

export type SandboxFormat = "bc7" | "astc";

export const UnifiedSandbox: React.FC = () => {
  const [format, setFormat] = useState<SandboxFormat>("bc7");

  return (
    <div className="space-y-6">
      {/* Format Selector Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3 sm:p-4 shadow-xl backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-md shadow-cyan-500/20">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  128-Bit GPU 纹理压缩算法二进制沙盒
                </h2>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-cyan-400 border border-slate-700">
                  16 Bytes Payload
                </span>
              </div>
              <p className="text-xs text-slate-400">
                切换选择标准 Direct3D/Vulkan BC7 格式 或 Khronos/ARM ASTC 格式进行 128-bit 比特流合成与调试
              </p>
            </div>
          </div>

          {/* In-Page Format Switcher */}
          <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 self-start sm:self-center">
            <button
              onClick={() => setFormat("bc7")}
              className={`flex items-center space-x-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                format === "bc7"
                  ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/25"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <Cpu className="h-4 w-4" />
              <div className="text-left">
                <div className="leading-tight">BC7 沙盒</div>
                <div className={`text-[9px] font-normal ${format === "bc7" ? "text-cyan-950" : "text-slate-500"}`}>
                  DirectX 11 / 4.0 bpp
                </div>
              </div>
            </button>

            <button
              onClick={() => setFormat("astc")}
              className={`flex items-center space-x-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all ${
                format === "astc"
                  ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/25"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <Layers className="h-4 w-4" />
              <div className="text-left">
                <div className="leading-tight">ASTC 沙盒</div>
                <div className={`text-[9px] font-normal ${format === "astc" ? "text-emerald-950" : "text-slate-500"}`}>
                  Khronos / 0.89~8.0 bpp
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Format Comparison Strip */}
        <div className="mt-3 grid grid-cols-1 gap-2 pt-3 border-t border-slate-800/80 text-[11px] sm:grid-cols-2">
          <div
            onClick={() => setFormat("bc7")}
            className={`cursor-pointer rounded-xl p-2.5 transition border ${
              format === "bc7"
                ? "border-cyan-500/50 bg-cyan-950/20 text-cyan-200"
                : "border-slate-800/60 bg-slate-950/40 text-slate-400 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${format === "bc7" ? "bg-cyan-400" : "bg-slate-600"}`} />
                <span>BC7 (BPTC) 规范特性</span>
              </span>
              <span className="font-mono text-[10px] text-cyan-400">4 bpp (固定 4x4)</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400 leading-normal">
              8 种固定模式 (Mode 0..7)，支持 1~3 个子集划分 (64 种预设形状)，P-Bit 奇偶位颜色扩充，可选 Alpha 通道独立旋转。
            </p>
          </div>

          <div
            onClick={() => setFormat("astc")}
            className={`cursor-pointer rounded-xl p-2.5 transition border ${
              format === "astc"
                ? "border-emerald-500/50 bg-emerald-950/20 text-emerald-200"
                : "border-slate-800/60 bg-slate-950/40 text-slate-400 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${format === "astc" ? "bg-emerald-400" : "bg-slate-600"}`} />
                <span>ASTC (Adaptive Scalable) 规范特性</span>
              </span>
              <span className="font-mono text-[10px] text-emerald-400">0.89 ~ 8.0 bpp (可变)</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400 leading-normal">
              全 14 种 Footprint 尺寸 (4x4 至 12x12)，16 种 CEM 模式，1024 种 Procedural 算法分区，Dual-Plane 双权值与任意权值网格双线性插值。
            </p>
          </div>
        </div>
      </div>

      {/* Active Sandbox View */}
      <div>
        {format === "bc7" ? <BitSandbox /> : <AstcSandbox />}
      </div>
    </div>
  );
};
