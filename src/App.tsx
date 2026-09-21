import React, { useState } from "react";
import { Navbar, ViewTab } from "./components/Navbar";
import { BlockTexelInspector } from "./components/BlockTexelInspector";
import { ModeMatrixExplorer } from "./components/ModeMatrixExplorer";
import { BitSandbox } from "./components/BitSandbox";
import { AstcSandbox } from "./components/AstcSandbox";
import { Cpu, ShieldCheck } from "lucide-react";

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
        {activeTab === "sandbox" && <BitSandbox />}
        {activeTab === "astc" && <AstcSandbox />}
      </main>

      {/* Bottom Technical Footer */}
      <footer className="mt-12 border-t border-slate-900 bg-slate-950 py-6 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center space-x-2">
            <Cpu className="h-4 w-4 text-cyan-500" />
            <span>BC7 / BPTC Texture Compression Engine &bull; 4 bpp (16 Bytes per 4x4 block)</span>
          </div>
          <div className="flex items-center space-x-4">
            <span>DirectX 11 &bull; Vulkan BPTC</span>
            <span>Google AI Studio Build &bull; Gemini 3.6 Flash</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
