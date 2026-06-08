import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, File, ChevronRight, ChevronDown, X, ChevronsDownUp, Settings2, Plus } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";

interface SearchMatch {
  file_path: string;
  file_name: string;
  line: number;
  content: string;
}

interface FileGroup {
  file_path: string;
  file_name: string;
  matches: SearchMatch[];
}

const DEFAULT_IGNORE = ["node_modules", "dist", "build", ".git", "target", ".next", "out", ".cache"];

function groupByFile(matches: SearchMatch[]): FileGroup[] {
  const map = new Map<string, FileGroup>();
  for (const m of matches) {
    if (!map.has(m.file_path)) {
      map.set(m.file_path, { file_path: m.file_path, file_name: m.file_name, matches: [] });
    }
    map.get(m.file_path)!.matches.push(m);
  }
  return Array.from(map.values());
}

function highlight(text: string, query: string) {
  if (!query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <>
      <span>{text.slice(0, idx)}</span>
      <span className="bg-[#003a00] text-[#00ff41] font-bold">{text.slice(idx, idx + query.length)}</span>
      <span>{text.slice(idx + query.length)}</span>
    </>
  );
}

export function SearchPanel() {
  const { workspacePath, openTab, setGotoLine, sidebarWidth } = useEditorStore();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<FileGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [totalMatches, setTotalMatches] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showIgnoreConfig, setShowIgnoreConfig] = useState(false);
  const [ignoreDirs, setIgnoreDirs] = useState<string[]>(DEFAULT_IGNORE);
  const [newIgnoreInput, setNewIgnoreInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ignoreInputRef = useRef<HTMLInputElement>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searching || !query.trim()) return;
    if (!workspacePath) {
      setError("No folder open. Open a workspace first.");
      return;
    }
    setSearching(true);
    setError(null);
    setGroups([]);
    setTotalMatches(0);
    setSearched(false);
    setCollapsed(new Set());
    try {
      const res = await invoke<SearchMatch[]>("search_in_files", {
        root: workspacePath,
        query: query.trim(),
        ignore: ignoreDirs,
      });
      setGroups(groupByFile(res));
      setTotalMatches(res.length);
      setSearched(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setGroups([]);
    setError(null);
    setTotalMatches(0);
    setSearched(false);
    setCollapsed(new Set());
    inputRef.current?.focus();
  }

  function toggleCollapse(filePath: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(filePath) ? next.delete(filePath) : next.add(filePath);
      return next;
    });
  }

  function addIgnoreDir() {
    const val = newIgnoreInput.trim();
    if (val && !ignoreDirs.includes(val)) {
      setIgnoreDirs((prev) => [...prev, val]);
    }
    setNewIgnoreInput("");
    ignoreInputRef.current?.focus();
  }

  function removeIgnoreDir(dir: string) {
    setIgnoreDirs((prev) => prev.filter((d) => d !== dir));
  }

  async function openMatch(match: SearchMatch) {
    try {
      const result = await invoke<{ content: string; path: string }>("read_file", {
        path: match.file_path,
      });
      openTab(match.file_path, match.file_name, result.content);
      setGotoLine(match.line);
    } catch {}
  }

  const relPath = (p: string) =>
    p.replace(workspacePath || "", "").replace(/^[/\\]/, "");

  return (
    <div className="flex flex-col h-full" style={{ width: sidebarWidth }}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#003a00] flex items-center justify-between">
        <span
          className="text-[#00ff41] text-sm font-semibold uppercase tracking-wider"
          style={{ textShadow: "0 0 4px rgba(0,255,65,0.4)" }}
        >
          Search
        </span>
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <span className="text-[#2d7a3a] text-xs font-mono">
              {totalMatches} in {groups.length} files
            </span>
          )}
          {groups.length > 0 && (
            <button
              title="Collapse all"
              onClick={() => setCollapsed(new Set(groups.map((g) => g.file_path)))}
              className="text-[#2d7a3a] hover:text-[#00ff41] transition-colors"
            >
              <ChevronsDownUp size={13} />
            </button>
          )}
          <button
            title="Ignore config"
            onClick={() => setShowIgnoreConfig((v) => !v)}
            className={`transition-colors ${showIgnoreConfig ? "text-[#00ff41]" : "text-[#2d7a3a] hover:text-[#00ff41]"}`}
          >
            <Settings2 size={13} />
          </button>
        </div>
      </div>

      {/* Search input */}
      <form onSubmit={handleSearch} className="px-3 pt-2 pb-1">
        <div className="flex items-center gap-2 bg-[#001a00] border border-[#003a00] px-2 py-1 focus-within:border-[#00ff41] transition-colors">
          <Search size={13} className="text-[#2d7a3a] flex-shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-[#00ff41] text-sm outline-none placeholder-[#2d7a3a] py-0.5"
            placeholder="Search in files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={searching}
          />
          {query && (
            <button type="button" onClick={clearSearch} className="text-[#2d7a3a] hover:text-[#00ff41] transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
      </form>

      {/* Ignore config panel */}
      {showIgnoreConfig && (
        <div className="mx-3 mb-2 border border-[#003a00] bg-[#020e02]">
          <div className="px-2 py-1 border-b border-[#003a00]">
            <span className="text-[#2d7a3a] text-xs font-mono uppercase tracking-wider">// ignore folders</span>
          </div>
          <div className="px-2 py-1.5 flex flex-wrap gap-1">
            {ignoreDirs.map((dir) => (
              <span
                key={dir}
                className="flex items-center gap-1 px-1.5 py-0.5 bg-[#001a00] border border-[#003a00] text-[#2d7a3a] text-xs font-mono"
              >
                {dir}
                <button
                  onClick={() => removeIgnoreDir(dir)}
                  className="text-[#1a4a25] hover:text-[#00ff41] transition-colors ml-0.5"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="px-2 pb-2">
            <div className="flex gap-1">
              <input
                ref={ignoreInputRef}
                className="flex-1 bg-[#001a00] border border-[#003a00] text-[#00ff41] text-xs font-mono px-2 py-1 outline-none focus:border-[#00ff41] transition-colors placeholder-[#1a4a25]"
                placeholder="add folder..."
                value={newIgnoreInput}
                onChange={(e) => setNewIgnoreInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addIgnoreDir(); } }}
              />
              <button
                onClick={addIgnoreDir}
                className="px-2 border border-[#003a00] text-[#2d7a3a] hover:text-[#00ff41] hover:border-[#00ff41] transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {searching && (
          <div className="px-3 py-3 text-[#2d7a3a] text-sm font-mono animate-pulse">
            // scanning...
          </div>
        )}

        {error && (
          <div className="px-3 py-2 text-red-400 text-sm font-mono border border-red-900 mx-3 my-2">
            {error}
          </div>
        )}

        {!searching && !error && searched && groups.length === 0 && (
          <div className="px-3 py-2 text-[#2d7a3a] text-sm font-mono">
            // no results for "{query}"
          </div>
        )}

        {!workspacePath && !searching && (
          <div className="px-3 py-2 text-[#2d7a3a] text-sm font-mono">
            // open a folder to search
          </div>
        )}

        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.file_path);
          return (
            <div key={group.file_path} className="mb-1">
              <button
                className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-[#001a00] transition-colors text-left"
                onClick={() => toggleCollapse(group.file_path)}
              >
                {isCollapsed ? (
                  <ChevronRight size={13} className="text-[#2d7a3a] flex-shrink-0" />
                ) : (
                  <ChevronDown size={13} className="text-[#2d7a3a] flex-shrink-0" />
                )}
                <File size={13} className="text-[#2d7a3a] flex-shrink-0" />
                <span className="text-[#00ff41] text-sm font-mono truncate flex-1">
                  {group.file_name}
                </span>
                <span className="text-[#2d7a3a] text-xs font-mono flex-shrink-0">
                  {group.matches.length}
                </span>
              </button>

              {!isCollapsed && (
                <div>
                  <div
                    className="px-3 pb-1 text-[#1a4a25] text-xs font-mono truncate"
                    title={relPath(group.file_path)}
                  >
                    {relPath(group.file_path)}
                  </div>
                  {group.matches.map((match, i) => (
                    <button
                      key={i}
                      className="w-full flex items-start gap-2 px-3 py-0.5 hover:bg-[#001a00] transition-colors text-left"
                      onClick={() => openMatch(match)}
                    >
                      <span className="text-[#1a5a2a] text-xs font-mono w-8 flex-shrink-0 text-right pt-0.5">
                        {match.line}
                      </span>
                      <span className="text-[#7aab7a] text-xs font-mono truncate leading-5">
                        {highlight(match.content, query)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
