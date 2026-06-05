import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Fish, FolderOpen, Clock } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";

export function WelcomePage() {
  const { recentFolders, setWorkspacePath, setFileTree, closeAllTabs, addRecentFolder } =
    useEditorStore();

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    closeAllTabs();
    setWorkspacePath(selected);
    addRecentFolder(selected);
    const tree = await invoke<any[]>("read_directory", { path: selected });
    setFileTree(tree);
  }

  async function openFolder(path: string) {
    closeAllTabs();
    setWorkspacePath(path);
    addRecentFolder(path);
    const tree = await invoke<any[]>("read_directory", { path });
    setFileTree(tree);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#1e1e1e] select-none">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3 mb-12">
        <Fish size={72} className="text-[#007acc] opacity-20" strokeWidth={1} />
        <div className="text-center">
          <h1 className="text-[#cccccc] text-3xl font-light tracking-wide">Fish Editor</h1>
          <p className="text-[#858585] text-sm mt-1">Open a folder to get started</p>
        </div>
      </div>

      {/* Open folder button */}
      <button
        onClick={handleOpenFolder}
        className="flex items-center gap-2 px-5 py-2.5 bg-[#007acc] hover:bg-[#0098ff] text-white text-sm rounded transition-colors mb-10"
      >
        <FolderOpen size={16} />
        Open Folder
      </button>

      {/* Recent folders */}
      {recentFolders.length > 0 && (
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Clock size={12} className="text-[#858585]" />
            <span className="text-[#858585] text-xs uppercase tracking-widest">Recent</span>
          </div>
          <div className="flex flex-col gap-1">
            {recentFolders.map((folderPath) => {
              const name = folderPath.split(/[/\\]/).pop() ?? folderPath;
              return (
                <button
                  key={folderPath}
                  onClick={() => openFolder(folderPath)}
                  title={folderPath}
                  className="flex items-center gap-3 px-3 py-2.5 rounded text-left hover:bg-[#2a2d2e] transition-colors group w-full"
                >
                  <FolderOpen size={15} className="text-[#e8c100] flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[#cccccc] text-sm truncate">{name}</span>
                    <span className="text-[#858585] text-xs truncate group-hover:text-[#6e6e6e]">
                      {folderPath}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="absolute bottom-8 flex items-center gap-6 text-[#555555] text-xs">
        <span><kbd className="bg-[#2d2d2d] text-[#858585] px-1.5 py-0.5 rounded text-xs">Ctrl+Shift+P</kbd> Command Palette</span>
        <span><kbd className="bg-[#2d2d2d] text-[#858585] px-1.5 py-0.5 rounded text-xs">Ctrl+J</kbd> Terminal</span>
      </div>
    </div>
  );
}
