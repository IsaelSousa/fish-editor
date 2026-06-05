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
      className="flex items-center h-8 bg-[#323233] border-b border-[#3e3e42] select-none shrink-0"
    >
      {/* Left: logo + actions */}
      <div className="flex items-center gap-1 px-2 shrink-0">
        <Fish style={{ marginLeft: '10px' }} size={14} className="text-[#007acc]" />
        <span className="text-[#cccccc] text-xs font-semibold ml-1 mr-2">
          Fish Editor
        </span>
        <button
          onClick={handleOpenFolder}
          title="Open Folder (Ctrl+O)"
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] text-xs transition-colors"
        >
          <FolderOpen size={12} />
          <span>Open</span>
        </button>
        <button
          onClick={handleSave}
          disabled={!activeTab}
          title="Save (Ctrl+S)"
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] text-xs transition-colors disabled:opacity-30"
        >
          <Save size={12} />
          <span>Save</span>
        </button>
        <button
          onClick={() => setCommandPaletteOpen(true)}
          title="Command Palette (Ctrl+Shift+P)"
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] text-xs transition-colors"
        >
          <span>&#8963;&#8679;P</span>
        </button>
      </div>

      {/* Center: title (drag region, grows to fill) */}
      <div data-tauri-drag-region className="flex-1 flex items-center justify-center">
        <span className="text-[#858585] text-xs pointer-events-none">
          {activeTab
            ? `${activeTab.name}${activeTab.isDirty ? " •" : ""} — ${title}`
            : title}
        </span>
      </div>

      {/* Right: window controls — always at far right */}
      <div className="flex items-center shrink-0">
        <button
          onClick={() => appWindow.minimize()}
          title="Minimize"
          className="w-11 h-8 flex items-center justify-center text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] transition-colors"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          title="Maximize"
          className="w-11 h-8 flex items-center justify-center text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] transition-colors"
        >
          <Square size={10} />
        </button>
        <button
          onClick={() => appWindow.close()}
          title="Close"
          className="w-11 h-8 flex items-center justify-center text-[#858585] hover:text-white hover:bg-[#e81123] transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
