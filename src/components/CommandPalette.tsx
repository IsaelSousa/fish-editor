import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEditorStore } from "../store/useEditorStore";
import { Search, File, Settings, FolderOpen, X } from "lucide-react";
import { FileEntry } from "../types";

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.JSX.Element;
  action: () => void;
}

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    workspacePath,
    setWorkspacePath,
    setFileTree,
    closeAllTabs,
    updateSettings,
    settings,
    tabs,
    openTab,
    activeTabId,
    markTabSaved,
  } = useEditorStore();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!query || !workspacePath) {
      setSearchResults([]);
      return;
    }
    if (query.startsWith(">")) return;
    const timer = setTimeout(async () => {
      const results = await invoke<FileEntry[]>("search_files", {
        root: workspacePath,
        query: query,
      });
      setSearchResults(results.filter((r) => !r.is_dir).slice(0, 20));
    }, 150);
    return () => clearTimeout(timer);
  }, [query, workspacePath]);

  const commands: Command[] = [
    {
      id: "open-folder",
      label: "Open Folder...",
      description: "Open a folder as workspace",
      icon: <FolderOpen size={14} />,
      action: async () => {
        const selected = await open({ directory: true, multiple: false });
        if (typeof selected === "string") {
          closeAllTabs();
          setWorkspacePath(selected);
          const tree = await invoke<FileEntry[]>("read_directory", { path: selected });
          setFileTree(tree);
        }
        setCommandPaletteOpen(false);
      },
    },
    {
      id: "save-file",
      label: "Save File",
      description: "Save the current file",
      icon: <File size={14} />,
      action: async () => {
        const tab = tabs.find((t) => t.id === activeTabId);
        if (tab) {
          await invoke("write_file", { path: tab.path, content: tab.content });
          markTabSaved(tab.id);
        }
        setCommandPaletteOpen(false);
      },
    },
    {
      id: "toggle-minimap",
      label: `${settings.minimap ? "Hide" : "Show"} Minimap`,
      icon: <Settings size={14} />,
      action: () => {
        updateSettings({ minimap: !settings.minimap });
        setCommandPaletteOpen(false);
      },
    },
    {
      id: "toggle-word-wrap",
      label: `Word Wrap: ${settings.wordWrap === "on" ? "Off" : "On"}`,
      icon: <Settings size={14} />,
      action: () => {
        updateSettings({ wordWrap: settings.wordWrap === "on" ? "off" : "on" });
        setCommandPaletteOpen(false);
      },
    },
    {
      id: "increase-font",
      label: "Increase Font Size",
      description: `Current: ${settings.fontSize}px`,
      icon: <Settings size={14} />,
      action: () => {
        updateSettings({ fontSize: Math.min(settings.fontSize + 1, 30) });
        setCommandPaletteOpen(false);
      },
    },
    {
      id: "decrease-font",
      label: "Decrease Font Size",
      description: `Current: ${settings.fontSize}px`,
      icon: <Settings size={14} />,
      action: () => {
        updateSettings({ fontSize: Math.max(settings.fontSize - 1, 8) });
        setCommandPaletteOpen(false);
      },
    },
  ];

  const isCommandMode = query.startsWith(">");
  const commandQuery = isCommandMode ? query.slice(1).trim().toLowerCase() : "";

  const filteredCommands = isCommandMode
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(commandQuery) ||
          c.description?.toLowerCase().includes(commandQuery)
      )
    : commands;

  const items = isCommandMode
    ? filteredCommands
    : searchResults.length > 0
    ? searchResults
    : filteredCommands;

  const totalItems = isCommandMode ? filteredCommands.length : items.length;

  async function openFile(entry: FileEntry) {
    const result = await invoke<{ content: string; path: string }>("read_file", {
      path: entry.path,
    });
    openTab(entry.path, entry.name, result.content);
    setCommandPaletteOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setCommandPaletteOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, totalItems - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (isCommandMode) {
        filteredCommands[selected]?.action();
      } else if (searchResults.length > 0) {
        const item = items[selected];
        if ("action" in item) {
          (item as Command).action();
        } else {
          openFile(item as FileEntry);
        }
      } else {
        filteredCommands[selected]?.action();
      }
    }
  }

  if (!commandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={() => setCommandPaletteOpen(false)}
      />
      <div
        className="relative w-[600px] max-w-[90vw] bg-[#000000] border border-[#003a00] overflow-hidden"
        style={{ boxShadow: '0 0 30px rgba(0,255,65,0.15), 0 0 60px rgba(0,0,0,0.8)' }}
      >
        {/* Input */}
        <div className="flex items-center px-4 py-3 border-b border-[#003a00]">
          <Search size={16} className="text-[#2d7a3a] mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-[#00ff41] text-sm outline-none placeholder-[#2d7a3a]"
            style={{ textShadow: '0 0 4px rgba(0,255,65,0.4)', caretColor: '#00ff41' }}
            placeholder="Search files or type '>' for commands..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-[#2d7a3a] hover:text-[#00ff41] cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {isCommandMode ? (
            filteredCommands.length === 0 ? (
              <div className="px-4 py-6 text-center text-[#2d7a3a] text-sm">
                No commands found
              </div>
            ) : (
              filteredCommands.map((cmd, i) => (
                <div
                  key={cmd.id}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${
                    i === selected ? "bg-[#003300]" : "hover:bg-[#001a00]"
                  }`}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span className="text-[#2d7a3a]">{cmd.icon}</span>
                  <div>
                    <div className="text-[#00ff41] text-sm">{cmd.label}</div>
                    {cmd.description && (
                      <div className="text-[#2d7a3a] text-xs">{cmd.description}</div>
                    )}
                  </div>
                </div>
              ))
            )
          ) : searchResults.length > 0 ? (
            searchResults.map((entry, i) => (
              <div
                key={entry.path}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${
                  i === selected ? "bg-[#003300]" : "hover:bg-[#001a00]"
                }`}
                onClick={() => openFile(entry)}
                onMouseEnter={() => setSelected(i)}
              >
                <File size={14} className="text-[#2d7a3a] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[#00ff41] text-sm truncate">{entry.name}</div>
                  <div className="text-[#1a4a25] text-xs truncate">{entry.path}</div>
                </div>
              </div>
            ))
          ) : (
            <>
              <div className="px-4 py-1.5 text-[#2d7a3a] text-xs uppercase tracking-wider font-semibold">
                // Commands
              </div>
              {commands.map((cmd, i) => (
                <div
                  key={cmd.id}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${
                    i === selected ? "bg-[#003300]" : "hover:bg-[#001a00]"
                  }`}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span className="text-[#2d7a3a]">{cmd.icon}</span>
                  <div>
                    <div className="text-[#00ff41] text-sm">{cmd.label}</div>
                    {cmd.description && (
                      <div className="text-[#2d7a3a] text-xs">{cmd.description}</div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#003a00] flex items-center gap-4 text-[#2d7a3a] text-xs">
          <span><kbd className="border border-[#003a00] px-1">↑↓</kbd> Navigate</span>
          <span><kbd className="border border-[#003a00] px-1">Enter</kbd> Select</span>
          <span><kbd className="border border-[#003a00] px-1">Esc</kbd> Close</span>
          <span className="ml-auto">Type <kbd className="border border-[#003a00] px-1">&gt;</kbd> for commands</span>
        </div>
      </div>
    </div>
  );
}
