import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Fish, FolderOpen, Save, X, Minus, Square } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  const { workspacePath, activeTabId, tabs, markTabSaved, setWorkspacePath, setFileTree, closeAllTabs, setCommandPaletteOpen, addRecentFolder } =
    useEditorStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const appWindow = getCurrentWindow();

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    closeAllTabs();
    setWorkspacePath(selected);
    addRecentFolder(selected);
    const tree = await invoke<any[]>("read_directory", { path: selected });
    setFileTree(tree);
  }

  async function handleSave() {
    if (!activeTab) return;
    await invoke("write_file", { path: activeTab.path, content: activeTab.content });
    markTabSaved(activeTab.id);
  }

  const title = workspacePath
    ? workspacePath.split(/[/\\]/).pop()
    : "Fish Editor";

  return (
    <div
      data-tauri-drag-region
      className="flex items-center h-10 bg-[#020202] border-b border-[#003a00] select-none shrink-0"
      style={{ boxShadow: '0 1px 0 #001a00' }}
    >
      {/* Left: logo + actions */}
      <div className="flex items-center gap-1 px-2 shrink-0">
        <Fish
          style={{ marginLeft: '10px', filter: 'drop-shadow(0 0 4px #00ff41)' }}
          size={14}
          className="text-[#00ff41]"
        />
        <span
          className="text-[#00ff41] text-sm font-semibold ml-1 mr-2"
          style={{ textShadow: '0 0 6px #00ff41' }}
        >
          Fish Editor
        </span>
        <button
          onClick={handleOpenFolder}
          title="Open Folder (Ctrl+O)"
          className="flex items-center gap-1 px-2 py-0.5 text-[#2d7a3a] hover:text-[#00ff41] hover:bg-[#001a00] text-sm transition-colors cursor-pointer"
        >
          <FolderOpen size={12} />
          <span>Open</span>
        </button>
        <button
          onClick={handleSave}
          disabled={!activeTab}
          title="Save (Ctrl+S)"
          className="flex items-center gap-1 px-2 py-0.5 text-[#2d7a3a] hover:text-[#00ff41] hover:bg-[#001a00] text-sm transition-colors disabled:opacity-30 cursor-pointer"
        >
          <Save size={12} />
          <span>Save</span>
        </button>
        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Command Palette (Ctrl+Shift+P)"
          className="flex items-center gap-1 px-2 py-0.5 text-[#2d7a3a] hover:text-[#00ff41] hover:bg-[#001a00] text-sm transition-colors cursor-pointer"
        >
          <span>&#8963;&#8679;P</span>
        </button>
      </div>

      {/* Center: title */}
      <div data-tauri-drag-region className="flex-1 flex items-center justify-center">
        <span className="text-[#2d7a3a] text-xs pointer-events-none">
          {activeTab
            ? `${activeTab.name}${activeTab.isDirty ? " ●" : ""} — ${title}`
            : title}
        </span>
      </div>

      {/* Right: window controls */}
      <div className="flex items-center shrink-0">
        <button
          onClick={() => appWindow.minimize()}
          title="Minimize"
          className="w-11 h-10 flex items-center justify-center text-[#2d7a3a] hover:text-[#00ff41] hover:bg-[#001a00] transition-colors cursor-pointer"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          title="Maximize"
          className="w-11 h-10 flex items-center justify-center text-[#2d7a3a] hover:text-[#00ff41] hover:bg-[#001a00] transition-colors cursor-pointer"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => appWindow.close()}
          title="Close"
          className="w-11 h-10 flex items-center justify-center text-[#2d7a3a] hover:text-[#ff3300] hover:bg-[#1a0000] transition-colors cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
