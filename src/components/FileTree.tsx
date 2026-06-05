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
        className="flex items-center gap-1 h-6 cursor-pointer hover:bg-[#2a2d2e] group relative pr-2"
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {entry.is_dir ? (
          <span className="text-[#858585] w-3 flex-shrink-0">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        <span className="flex-shrink-0">{icon}</span>

        {renaming ? (
          <input
            autoFocus
            className="flex-1 bg-[#3c3c3c] text-[#cccccc] text-xs px-1 outline-none border border-[#007acc] rounded"
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
          <span className="text-[#cccccc] truncate flex-1" style={{ fontSize: settings.fileTreeFontSize }}>{entry.name}</span>
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
            className="fixed z-50 bg-[#252526] border border-[#3e3e42] rounded shadow-xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-1 text-xs text-[#cccccc] hover:bg-[#094771] flex items-center gap-2"
              onClick={() => { setRenaming(true); setContextMenu(null); }}
            >
              Rename
            </button>
            <button
              className="w-full text-left px-3 py-1 text-xs text-[#f44747] hover:bg-[#094771] flex items-center gap-2"
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
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#3e3e42]">
        <span className="text-[#bbbbbb] text-xs font-semibold uppercase tracking-wider truncate ml-4">
          {workspacePath!.split(/[/\\]/).pop()}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreating("file")}
            title="New File"
            className="p-1 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e]"
          >
            <FilePlus size={settings.headerIconSize} style={{ margin: '4px' }} />
          </button>
          <button
            onClick={() => setCreating("dir")}
            title="New Folder"
            className="p-1 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e]"
          >
            <FolderPlus size={settings.headerIconSize} style={{ margin: '4px' }} />
          </button>
          <button
            onClick={refresh}
            title="Refresh"
            className="p-1 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e]"
          >
            <RefreshCw size={settings.headerIconSize} style={{ margin: '4px' }} />
          </button>
        </div>
      </div>

      {/* New item input */}
      {creating && (
        <div className="px-3 py-1.5 border-b border-[#3e3e42]">
          <input
            autoFocus
            placeholder={creating === "file" ? "filename.ext" : "folder name"}
            className="w-full bg-[#3c3c3c] text-[#cccccc] text-xs px-2 py-1 outline-none border border-[#007acc] rounded"
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
