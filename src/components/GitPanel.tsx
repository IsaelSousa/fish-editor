import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, X } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";
import { isImagePath, imageMimeType } from "../utils/imageUtils";

interface GitCommit {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  time: string;
  refs: string[];
}

interface GitLogEntry {
  graph_line: string;
  commit: GitCommit | null;
}

interface SelectedFile {
  file: string;
  status: string;
}

const LANE_COLORS = [
  "#00ff41", "#00ccff", "#ffcc00", "#ff6633",
  "#cc44ff", "#00ffcc", "#ff44aa", "#88ff00",
];

function laneColor(col: number) {
  return LANE_COLORS[col % LANE_COLORS.length];
}

function renderGraph(raw: string): React.ReactNode {
  if (!raw.trim()) return <span>{raw}</span>;
  const spans: React.ReactNode[] = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const lane = Math.floor(i / 2);
    const color = laneColor(lane);
    if (ch === "*") {
      spans.push(<span key={i} style={{ color, textShadow: `0 0 6px ${color}` }}>●</span>);
    } else if (ch === "|") {
      spans.push(<span key={i} style={{ color }}>│</span>);
    } else if (ch === "/") {
      spans.push(<span key={i} style={{ color: laneColor(lane - 1 >= 0 ? lane - 1 : 0) }}>╱</span>);
    } else if (ch === "\\") {
      spans.push(<span key={i} style={{ color: laneColor(lane + 1) }}>╲</span>);
    } else if (ch === "-" || ch === "_") {
      spans.push(<span key={i} style={{ color }}>─</span>);
    } else {
      spans.push(<span key={i} className="text-[#1a3a22]">{ch}</span>);
    }
  }
  return <>{spans}</>;
}

function RefBadge({ label }: { label: string }) {
  const isHead = label.includes("HEAD");
  const isTag = label.startsWith("tag:");
  const isRemote = label.includes("origin/") || label.includes("upstream/");
  const color = isHead ? "#00ff41" : isTag ? "#ffcc00" : isRemote ? "#00ccff" : "#cc44ff";
  const display = isTag ? label.replace("tag: ", "") : label;
  return (
    <span
      className="inline-block text-sm px-1 border mx-0.5 shrink-0 whitespace-nowrap"
      style={{ color, borderColor: color, textShadow: `0 0 4px ${color}` }}
    >
      {display}
    </span>
  );
}

function StatusLine({
  line,
  selected,
  onClick,
}: {
  line: string;
  selected: boolean;
  onClick: () => void;
}) {
  const xy = line.slice(0, 2);
  const file = line.slice(3);
  const isAdded = xy === "??";
  const isDeleted = xy.includes("D");
  const isModified = xy.includes("M");
  const isStaged = xy[0] !== " " && xy[0] !== "?";

  const color = isAdded
    ? "#00ff41"
    : isDeleted
    ? "#ff3300"
    : isModified
    ? "#ffcc00"
    : "#00ccff";
  const label = isAdded ? "NEW" : isDeleted ? "DEL" : isModified && isStaged ? "STG" : "MOD";

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-0.5 cursor-pointer font-mono text-sm transition-colors"
      style={{ backgroundColor: selected ? "#001f00" : undefined }}
    >
      <span
        className="border text-sm px-1 shrink-0 w-8 text-center"
        style={{ color, borderColor: color }}
      >
        {label}
      </span>
      <span className="truncate" style={{ color: selected ? "#00ff41" : "#2d7a3a" }}>
        {file}
      </span>
      {selected && (
        <span className="ml-auto text-[#00ff41] opacity-60 text-xs">›</span>
      )}
    </div>
  );
}

function DiffViewer({
  diff,
  file,
  loading,
  onClose,
}: {
  diff: string;
  file: string;
  loading: boolean;
  onClose: () => void;
}) {
  const lines = diff.split("\n");

  return (
    <div className="flex flex-col h-full bg-[#020202] border-l border-[#003a00] min-w-0">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b border-[#003a00] shrink-0"
        style={{ boxShadow: "0 1px 0 #001a00" }}
      >
        <span
          className="text-[#00ccff] text-xs font-mono uppercase tracking-widest shrink-0"
          style={{ textShadow: "0 0 6px #00ccff" }}
        >
          ≈ DIFF
        </span>
        <span className="text-[#2d7a3a] text-xs font-mono truncate flex-1" title={file}>
          {file}
        </span>
        <button
          onClick={onClose}
          className="text-[#2d7a3a] hover:text-[#ff3300] transition-colors shrink-0"
          title="Close"
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto font-mono text-xs leading-5">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[#2d7a3a] text-xs uppercase tracking-widest">
            <span className="animate-pulse">loading diff...</span>
          </div>
        ) : diff.trim() === "" ? (
          <div className="flex items-center justify-center h-full text-[#1a4a25] text-xs uppercase tracking-widest">
            no changes
          </div>
        ) : (
          lines.map((line, i) => {
            const isAdd = line.startsWith("+") && !line.startsWith("+++");
            const isDel = line.startsWith("-") && !line.startsWith("---");
            const isHunk = line.startsWith("@@");
            const isMeta =
              line.startsWith("+++") ||
              line.startsWith("---") ||
              line.startsWith("diff ") ||
              line.startsWith("index ") ||
              line.startsWith("new file") ||
              line.startsWith("deleted file");

            let textColor = "#2d5a30";
            let bgColor = "transparent";
            let gutter = "#1a3a22";

            if (isAdd) {
              textColor = "#00ff41";
              bgColor = "#001800";
              gutter = "#003a00";
            } else if (isDel) {
              textColor = "#ff4422";
              bgColor = "#1a0400";
              gutter = "#3a0a00";
            } else if (isHunk) {
              textColor = "#00ccff";
              bgColor = "#00121a";
              gutter = "#001a25";
            } else if (isMeta) {
              textColor = "#1a4a25";
            }

            return (
              <div
                key={i}
                className="flex items-start"
                style={{ backgroundColor: bgColor }}
              >
                <span
                  className="select-none text-right pr-2 pl-2 shrink-0 w-10"
                  style={{ color: gutter, lineHeight: "20px" }}
                >
                  {!isMeta ? i + 1 : ""}
                </span>
                <span
                  style={{
                    color: textColor,
                    whiteSpace: "pre",
                    lineHeight: "20px",
                  }}
                >
                  {line}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function GitPanel() {
  const { workspacePath } = useEditorStore();
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [diff, setDiff] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspacePath) return;
    setLoading(true);
    try {
      const [logData, branchData, statusData] = await Promise.all([
        invoke<GitLogEntry[]>("get_git_log", { path: workspacePath }),
        invoke<string>("get_git_branch", { path: workspacePath }),
        invoke<string[]>("get_git_status", { path: workspacePath }),
      ]);
      setLog(logData);
      setBranch(branchData);
      setStatus(statusData);
      setIsGitRepo(true);
    } catch {
      setIsGitRepo(false);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => { load(); }, [load]);

  const handleFileClick = useCallback(
    async (line: string) => {
      if (!workspacePath) return;
      const xy = line.slice(0, 2);
      const file = line.slice(3);
      setSelectedFile({ file, status: xy });
      setDiff("");
      setImageData(null);
      setDiffLoading(true);
      try {
        if (isImagePath(file)) {
          const sep = workspacePath.includes("\\") ? "\\" : "/";
          const absPath = `${workspacePath}${sep}${file.replace(/\//g, sep)}`;
          const b64 = await invoke<string>("read_binary_file", { path: absPath });
          setImageData(`data:${imageMimeType(file)};base64,${b64}`);
        } else {
          const result = await invoke<string>("get_git_diff", {
            path: workspacePath,
            file,
            status: xy,
          });
          setDiff(result);
        }
      } catch (e) {
        setDiff(`error: ${e}`);
      } finally {
        setDiffLoading(false);
      }
    },
    [workspacePath]
  );

  const handleClosePanel = useCallback(() => {
    setSelectedFile(null);
    setDiff("");
    setImageData(null);
  }, []);

  if (isGitRepo === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-[#2d7a3a] gap-3 select-none">
        <span className="text-4xl opacity-20">⎇</span>
        <p className="text-sm uppercase tracking-widest">No .git folder found in workspace</p>
      </div>
    );
  }

  const modified = status.filter((l) => !l.startsWith("??")).length;
  const untracked = status.filter((l) => l.startsWith("??")).length;

  return (
    <div className="flex flex-col h-full bg-black overflow-hidden select-none">
      {/* Header */}
      <div
        className="flex items-center gap-4 px-6 py-2 border-b border-[#003a00] shrink-0"
        style={{ boxShadow: "0 1px 0 #001a00" }}
      >
        <span
          className="text-[#00ff41] text-sm font-semibold uppercase tracking-widest"
          style={{ textShadow: "0 0 6px #00ff41" }}
        >
          ⎇ GIT GRAPH
        </span>
        {branch && (
          <span
            className="border border-[#00ff41] text-[#00ff41] text-sm px-2 py-0.5"
            style={{ textShadow: "0 0 4px #00ff41" }}
          >
            {branch}
          </span>
        )}
        {modified > 0 && (
          <span className="border border-[#ffcc00] text-[#ffcc00] text-sm px-2 py-0.5">
            {modified} modified
          </span>
        )}
        {untracked > 0 && (
          <span className="border border-[#2d7a3a] text-[#2d7a3a] text-sm px-2 py-0.5">
            {untracked} untracked
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={load}
          disabled={loading}
          title="Refresh"
          className="flex items-center gap-1.5 text-[#2d7a3a] hover:text-[#00ff41] text-sm transition-colors"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          <span className="uppercase tracking-wider">Refresh</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: status + commit graph */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ width: selectedFile ? "40%" : "100%", minWidth: 0 }}
        >
          <div className="flex-1 overflow-y-auto overflow-x-auto">
            {status.length > 0 && (
              <div className="border-b border-[#001a00] py-1">
                <div className="px-6 py-1 text-[#2d7a3a] text-xs uppercase tracking-widest">
                  // Working Tree
                </div>
                {status.map((line, i) => (
                  <StatusLine
                    key={i}
                    line={line}
                    selected={selectedFile?.file === line.slice(3)}
                    onClick={() => handleFileClick(line)}
                  />
                ))}
              </div>
            )}

            <table className="w-full border-collapse font-mono text-sm">
              <thead>
                <tr className="border-b border-[#001a00]">
                  <th className="text-left px-4 py-1 text-[#1a4a25] text-xs uppercase tracking-widest font-normal w-px whitespace-nowrap" style={{ paddingLeft: 12 }}>
                    Graph
                  </th>
                  <th className="text-left px-2 py-1 text-[#1a4a25] text-xs uppercase tracking-widest font-normal w-px whitespace-nowrap" style={{ paddingRight: 12 }}>
                    Hash
                  </th>
                  <th className="text-left px-2 py-1 text-[#1a4a25] text-xs uppercase tracking-widest font-normal" style={{ paddingRight: 12 }}>
                    Message
                  </th>
                  <th className="text-left px-2 py-1 text-[#1a4a25] text-xs uppercase tracking-widest font-normal w-px whitespace-nowrap" style={{ paddingRight: 12 }}>
                    Author
                  </th>
                  <th className="text-right px-4 py-1 text-[#1a4a25] text-xs uppercase tracking-widest font-normal w-px whitespace-nowrap" style={{ paddingRight: 12 }}>
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[#030303] ${
                      entry.commit ? "hover:bg-[#001400] cursor-pointer" : ""
                    }`}
                  >
                    <td className="px-4 py-0.5 whitespace-pre leading-5" style={{ paddingLeft: 12 }}>
                      {renderGraph(entry.graph_line)}
                    </td>
                    {entry.commit ? (
                      <>
                        <td className="px-2 py-0.5 whitespace-nowrap" style={{ paddingRight: 12 }}>
                          <span className="text-[#2d7a3a]">{entry.commit.short_hash}</span>
                        </td>
                        <td className="px-2 py-0.5 max-w-0" style={{ paddingRight: 12 }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            {entry.commit.refs.map((ref, j) => (
                              <RefBadge key={j} label={ref} />
                            ))}
                            <span
                              className="text-[#00ff41] truncate"
                              style={{ textShadow: "0 0 3px rgba(0,255,65,0.3)" }}
                            >
                              {entry.commit.message}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-0.5 whitespace-nowrap text-[#1a4a25]" style={{ paddingRight: 12 }}>
                          {entry.commit.author}
                        </td>
                        <td className="px-4 py-0.5 whitespace-nowrap text-right text-[#1a4a25]" style={{ paddingRight: 12 }}>
                          {entry.commit.time}
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} />
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {log.length === 0 && !loading && (
              <div className="px-6 py-4 text-[#2d7a3a] text-sm">No commits yet.</div>
            )}
          </div>
        </div>

        {/* Right: diff / image panel */}
        {selectedFile && (
          <div className="flex-1 min-w-0 overflow-hidden">
            {imageData ? (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-[#003a00] shrink-0">
                  <span className="text-[#2d7a3a] text-xs font-mono flex-1 truncate">{selectedFile.file}</span>
                  <button onClick={handleClosePanel} className="text-[#2d7a3a] hover:text-[#00ff41] transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex-1 flex items-center justify-center overflow-auto p-4"
                     style={{ backgroundImage: "repeating-conic-gradient(#111 0% 25%, #0a0a0a 0% 50%)", backgroundSize: "20px 20px" }}>
                  <img src={imageData} alt={selectedFile.file} className="max-w-full max-h-full object-contain shadow-lg" />
                </div>
              </div>
            ) : (
              <DiffViewer
                diff={diff}
                file={selectedFile.file}
                loading={diffLoading}
                onClose={handleClosePanel}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
