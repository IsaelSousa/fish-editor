import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  ChevronDown,
  FilePlus,
  FolderPlus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { useState, useCallback } from "react";
import { FileEntry } from "../types";
import { useEditorStore } from "../store/useEditorStore";
import { getFileIcon } from "../utils/fileIcons";

interface FileNodeProps {
  entry: FileEntry;
  depth: number;
  onRefresh?: (path: string) => void;
}

function FileNode({ entry, depth, onRefresh }: FileNodeProps) {
  const { expandedDirs, toggleDir, updateDirChildren, openTab, settings } = useEditorStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(entry.name);

  const isExpanded = expandedDirs.has(entry.path);

  async function handleClick() {
    if (entry.is_dir) {
      toggleDir(entry.path);
      if (!expandedDirs.has(entry.path)) {
        try {
          const children = await invoke<FileEntry[]>("read_directory", { path: entry.path });
          updateDirChildren(entry.path, children);
        } catch (e) {
          console.error("Failed to read directory:", e);
        }
      }
    } else {
      try {
        const result = await invoke<{ content: string; path: string }>("read_file", {
          path: entry.path,
        });
        openTab(entry.path, entry.name, result.content);
      } catch (e) {
        console.error("Failed to read file:", e);
      }
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    await invoke("delete_path", { path: entry.path });
    onRefresh?.(entry.path);
    setContextMenu(null);
  }

  async function handleRename() {
    setRenaming(false);
    if (newName === entry.name) return;
    const sep = entry.path.includes("\\") ? "\\" : "/";
    const parent = entry.path.split(sep).slice(0, -1).join(sep);
    const newPath = `${parent}${sep}${newName}`;
    await invoke("rename_path", { oldPath: entry.path, newPath });
    onRefresh?.(entry.path);
  }

  const icon = getFileIcon(entry, settings.fileIconSize);
  const paddingLeft = 12 + depth * 16;

  return (
    <>
      <div
        style={{ paddingLeft }}
        className="flex items-center gap-1 h-6 cursor-pointer hover:bg-[#001a00] group relative pr-2"
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {entry.is_dir ? (
          <span className="text-[#2d7a3a] w-3 flex-shrink-0">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        <span className="flex-shrink-0">{icon}</span>

        {renaming ? (
          <input
            autoFocus
            className="flex-1 bg-[#001a00] text-[#00ff41] text-xs px-1 outline-none border border-[#00ff41]"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-[#00ff41] truncate flex-1" style={{ fontSize: settings.fileTreeFontSize }}>
            {entry.name}
          </span>
        )}
      </div>

      {entry.is_dir && isExpanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <FileNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-[#000000] border border-[#003a00] py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y, boxShadow: '0 0 12px rgba(0,255,65,0.2)' }}
          >
            <button
              className="w-full text-left px-3 py-1 text-xs text-[#00ff41] hover:bg-[#001a00] flex items-center gap-2"
              onClick={() => { setRenaming(true); setContextMenu(null); }}
            >
              Rename
            </button>
            <button
              className="w-full text-left px-3 py-1 text-xs text-[#ff3300] hover:bg-[#001a00] flex items-center gap-2"
              onClick={handleDelete}
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </>
      )}
    </>
  );
}

export function FileTree() {
  const { workspacePath, fileTree, setFileTree, sidebarWidth, settings } = useEditorStore();
  const [newItemName, setNewItemName] = useState("");
  const [creating, setCreating] = useState<"file" | "dir" | null>(null);

  async function refresh() {
    if (!workspacePath) return;
    const tree = await invoke<FileEntry[]>("read_directory", { path: workspacePath });
    setFileTree(tree);
  }

  async function handleCreate() {
    if (!newItemName || !workspacePath) return;
    const sep = workspacePath.includes("\\") ? "\\" : "/";
    const newPath = `${workspacePath}${sep}${newItemName}`;
    if (creating === "file") {
      await invoke("create_file", { path: newPath });
    } else {
      await invoke("create_directory", { path: newPath });
    }
    setNewItemName("");
    setCreating(null);
    await refresh();
  }

  const handleRefresh = useCallback(() => refresh(), [workspacePath]);

  return (
    <div className="flex flex-col h-full" style={{ width: sidebarWidth }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#003a00]">
        <span className="text-[#00ff41] text-xs font-semibold uppercase tracking-wider truncate ml-4" style={{ textShadow: '0 0 4px rgba(0,255,65,0.4)' }}>
          {workspacePath!.split(/[/\\]/).pop()}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreating("file")}
            title="New File"
            className="p-1 text-[#2d7a3a] hover:text-[#00ff41] hover:bg-[#001a00]"
          >
            <FilePlus size={settings.headerIconSize} style={{ margin: '4px' }} />
          </button>
          <button
            onClick={() => setCreating("dir")}
            title="New Folder"
            className="p-1 text-[#2d7a3a] hover:text-[#00ff41] hover:bg-[#001a00]"
          >
            <FolderPlus size={settings.headerIconSize} style={{ margin: '4px' }} />
          </button>
          <button
            onClick={refresh}
            title="Refresh"
            className="p-1 text-[#2d7a3a] hover:text-[#00ff41] hover:bg-[#001a00]"
          >
            <RefreshCw size={settings.headerIconSize} style={{ margin: '4px' }} />
          </button>
        </div>
      </div>

      {/* New item input */}
      {creating && (
        <div className="px-3 py-1.5 border-b border-[#003a00]">
          <input
            autoFocus
            placeholder={creating === "file" ? "filename.ext" : "folder name"}
            className="w-full bg-[#001a00] text-[#00ff41] text-xs px-2 py-1 outline-none border border-[#00ff41] placeholder-[#2d7a3a]"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(null); setNewItemName(""); }
            }}
            onBlur={() => { setCreating(null); setNewItemName(""); }}
          />
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {fileTree.map((entry) => (
          <FileNode
            key={entry.path}
            entry={entry}
            depth={0}
            onRefresh={handleRefresh}
          />
        ))}
      </div>
    </div>
  );
}
