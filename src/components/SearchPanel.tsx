import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, File } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";
import { FileEntry } from "../types";

export function SearchPanel() {
  const { workspacePath, openTab, sidebarWidth } = useEditorStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileEntry[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query || !workspacePath) return;
    setSearching(true);
    const res = await invoke<FileEntry[]>("search_files", {
      root: workspacePath,
      query,
    });
    setResults(res.filter((r) => !r.is_dir));
    setSearching(false);
  }

  async function openFile(entry: FileEntry) {
    const result = await invoke<{ content: string; path: string }>("read_file", {
      path: entry.path,
    });
    openTab(entry.path, entry.name, result.content);
  }

  return (
    <div className="flex flex-col h-full" style={{ width: sidebarWidth }}>
      <div className="px-3 py-2 border-b border-[#3e3e42]">
        <span className="text-[#bbbbbb] text-xs font-semibold uppercase tracking-wider">
          Search
        </span>
      </div>

      <form onSubmit={handleSearch} className="px-3 py-2">
        <div className="flex items-center gap-2 bg-[#3c3c3c] rounded px-2 py-1">
          <Search size={12} className="text-[#858585]" />
          <input
            className="flex-1 bg-transparent text-[#cccccc] text-xs outline-none placeholder-[#858585]"
            placeholder="Search files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </form>

      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="px-3 py-2 text-[#858585] text-xs">Searching...</div>
        )}
        {!searching && results.length === 0 && query && (
          <div className="px-3 py-2 text-[#858585] text-xs">No results</div>
        )}
        {results.map((entry) => (
          <div
            key={entry.path}
            className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[#2a2d2e] group"
            onClick={() => openFile(entry)}
          >
            <File size={13} className="text-[#858585] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[#cccccc] text-xs truncate">{entry.name}</div>
              <div className="text-[#858585] text-[10px] truncate">
                {entry.path.replace(workspacePath || "", ".")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
