import React from "react";
import { Cpu, Eye, Grid, Sliders, Layers } from "lucide-react";

export type ViewTab = "inspector" | "matrix" | "sandbox";

interface NavbarProps {
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const tabs: Array<{ id: ViewTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: "inspector", label: "4x4 块比特剖析", icon: Eye },
    { id: "matrix", label: "Mode 与 Partition 矩阵", icon: Grid },
    { id: "sandbox", label: "128-bit 算法沙盒 (BC7 / ASTC)", icon: Sliders },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                BC7 Texture Inspector
              </h1>
              <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-400 border border-cyan-500/20">
                BPTC 4 bpp
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Direct3D 11 / Vulkan 128-bit BC7 纹理压缩算法剖析与学习平台
            </p>
          </div>
        </div>

        <nav className="mt-2 flex w-full overflow-x-auto space-x-1 pb-1 sm:mt-0 sm:w-auto sm:pb-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
