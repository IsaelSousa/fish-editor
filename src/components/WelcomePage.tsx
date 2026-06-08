import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
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
    <div className="flex flex-col items-center justify-center h-full bg-black select-none overflow-hidden">
      {/* ASCII art header */}
      <div className="mb-8 text-center">
        <pre
          className="text-[#00ff41] leading-tight text-[11px]"
          style={{
            textShadow: '0 0 8px #00ff41, 0 0 20px rgba(0,255,65,0.3)',
            fontFamily: "'Share Tech Mono', 'VT323', 'Consolas', 'Courier New', monospace",
          }}
        >
{` _____ ___ ___ _  _   ___ ___ ___ _____ ___  ___
|  ___|_ _/ __| || | | __|   \\_ _|_   _/ _ \\| _ \\
| |_   | |\\__ \\ __ | | _|| |) | |  | || (_) |   /
|_|   |___|___/_||_| |___|___/___| |_| \\___/|_|_\\`}
        </pre>

        <div className="mt-4 border border-[#003a00] px-6 py-1 inline-block">
          <span
            className="text-[#00ff41] text-xs tracking-widest uppercase"
            style={{ textShadow: '0 0 6px #00ff41' }}
          >
            ■ SYSTEM ONLINE ■ v1.0.0 ■ ALL SYSTEMS GO ■
          </span>
        </div>
      </div>

      {/* Terminal prompt */}
      <div className="flex flex-col items-center gap-3 mb-10">
        <div className="text-[#2d7a3a] text-xs font-mono">
          root@fish-editor:~$ <span className="text-[#00ff41]">_</span>
        </div>
        <button
          onClick={handleOpenFolder}
          className="border border-[#00ff41] px-8 py-2 text-[#00ff41] text-xs uppercase tracking-widest transition-all hover:bg-[#001a00] cursor-pointer"
          style={{
            textShadow: '0 0 6px #00ff41',
            boxShadow: '0 0 10px rgba(0,255,65,0.25), inset 0 0 10px rgba(0,255,65,0.05)',
            fontFamily: "'Share Tech Mono', 'Consolas', monospace",
          }}
        >
          &gt; OPEN_WORKSPACE
        </button>
      </div>

      {/* Recent folders */}
      {recentFolders.length > 0 && (
        <div className="w-full max-w-md border border-[#003a00] p-3" style={{ boxShadow: '0 0 8px rgba(0,255,65,0.1)' }}>
          <div className="text-[#2d7a3a] text-xs uppercase tracking-widest mb-3 pb-1 border-b border-[#001a00]">
            // RECENT ACCESS LOG
          </div>
          <div className="flex flex-col gap-0.5">
            {recentFolders.map((folderPath) => {
              const name = folderPath.split(/[/\\]/).pop() ?? folderPath;
              return (
                <button
                  key={folderPath}
                  onClick={() => openFolder(folderPath)}
                  title={folderPath}
                  className="flex items-center gap-2 px-2 py-1 text-left hover:bg-[#001a00] transition-colors group w-full cursor-pointer"
                >
                  <span className="text-[#2d7a3a] text-xs flex-shrink-0">&gt;</span>
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[#00ff41] text-xs truncate group-hover:underline"
                      style={{ textShadow: '0 0 4px rgba(0,255,65,0.4)' }}
                    >
                      {name}
                    </span>
                    <span className="text-[#1a4a25] text-[10px] truncate">{folderPath}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="absolute bottom-10 flex items-center gap-6 text-[#1a4a25] text-xs">
        <span>
          <kbd className="border border-[#003a00] text-[#2d7a3a] px-1.5 py-0.5 text-xs">
            Ctrl+Shift+P
          </kbd>{" "}
          Command Palette
        </span>
        <span>
          <kbd className="border border-[#003a00] text-[#2d7a3a] px-1.5 py-0.5 text-xs">
            Ctrl+J
          </kbd>{" "}
          Terminal
        </span>
      </div>
    </div>
  );
}

