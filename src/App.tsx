import React, { useState } from "react";
import { Navbar, ViewTab } from "./components/Navbar";
import { BlockTexelInspector } from "./components/BlockTexelInspector";
import { ModeMatrixExplorer } from "./components/ModeMatrixExplorer";
import { UnifiedSandbox } from "./components/UnifiedSandbox";
import { Cpu } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>("inspector");

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Top Fixed Header */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main View Container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeTab === "inspector" && <BlockTexelInspector />}
        {activeTab === "matrix" && <ModeMatrixExplorer />}
        {activeTab === "sandbox" && <UnifiedSandbox />}
      </main>

      {/* Bottom Technical Footer */}
      <footer className="mt-12 border-t border-slate-900 bg-slate-950 py-6 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center space-x-2">
            <Cpu className="h-4 w-4 text-cyan-500" />
            <span>BC7 & ASTC 128-Bit GPU 纹理压缩算法全景深度解析平台</span>
          </div>
          <div className="flex items-center space-x-4">
            <span>DirectX 11 &bull; Vulkan BPTC &bull; Khronos ASTC</span>
            <span>Real-Time Graphics Lab</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
