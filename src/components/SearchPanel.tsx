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
      <div className="px-3 py-2 border-b border-[#003a00]">
        <span className="text-[#00ff41] text-sm font-semibold uppercase tracking-wider" style={{ textShadow: '0 0 4px rgba(0,255,65,0.4)', paddingLeft: 4, paddingRight: 4 }}>
          Search
        </span>
      </div>

      <form onSubmit={handleSearch} className="px-3 py-2">
        <div className="flex items-center gap-2 bg-[#001a00] border border-[#003a00] px-2 py-1 focus-within:border-[#00ff41] transition-colors">
          <Search size={12} className="text-[#2d7a3a]" />
          <input
            className="flex-1 bg-transparent text-[#00ff41] text-sm outline-none placeholder-[#2d7a3a]"
            placeholder="Search files..."
            value={query}
            style={{ padding: 4 }}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </form>

      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="px-3 py-2 text-[#2d7a3a] text-sm">Scanning...</div>
        )}
        {!searching && results.length === 0 && query && (
          <div className="px-3 py-2 text-[#2d7a3a] text-sm">No results found.</div>
        )}
        {results.map((entry) => (
          <div
            key={entry.path}
            className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[#001a00] group"
            onClick={() => openFile(entry)}
          >
            <File size={13} className="text-[#2d7a3a] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[#00ff41] text-sm truncate">{entry.name}</div>
              <div className="text-[#1a4a25] text-[10px] truncate">
                {entry.path.replace(workspacePath || "", ".")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
