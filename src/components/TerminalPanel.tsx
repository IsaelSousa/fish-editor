import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { X, Plus, Trash2 } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";

const TERM_THEME = {
  background: "#1a1a1a",
  foreground: "#cccccc",
  cursor: "#aeafad",
  cursorAccent: "#1a1a1a",
  selectionBackground: "#264f7855",
  black: "#1e1e1e",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#ffffff",
};

type TermInstance = {
  term: Terminal;
  fitAddon: FitAddon;
  ptyId: number | null;
  unlisten: (() => void) | null;
};

type TermTab = { id: number; name: string };

export function TerminalPanel() {
  const { setTerminalVisible, terminalHeight } = useEditorStore();

  const [tabs, setTabs] = useState<TermTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  const tabIdCounter = useRef(0);
  const instances = useRef<Map<number, TermInstance>>(new Map());
  const containerRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const callbackRefs = useRef<Map<number, (el: HTMLDivElement | null) => void>>(new Map());
  const initializedIds = useRef<Set<number>>(new Set());

  function getContainerRef(id: number) {
    if (!callbackRefs.current.has(id)) {
      callbackRefs.current.set(id, (el: HTMLDivElement | null) => {
        if (el) {
          containerRefs.current.set(id, el);
          initTerminal(id);
        } else {
          containerRefs.current.delete(id);
        }
      });
    }
    return callbackRefs.current.get(id)!;
  }

  async function initTerminal(id: number) {
    if (initializedIds.current.has(id)) return;
    const container = containerRefs.current.get(id);
    if (!container) return;

    initializedIds.current.add(id);

    const term = new Terminal({
      theme: TERM_THEME,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "block",
      allowTransparency: false,
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    fitAddon.fit();

    instances.current.set(id, { term, fitAddon, ptyId: null, unlisten: null });

    let ptyId: number;
    try {
      ptyId = await invoke<number>("create_pty", { cols: term.cols, rows: term.rows });
    } catch (e) {
      term.writeln(`\x1b[31mFailed to create terminal: ${e}\x1b[0m`);
      return;
    }

    const unlisten = await listen<string>(`pty-output-${ptyId}`, (event) => {
      term.write(event.payload);
    });

    await listen(`pty-closed-${ptyId}`, () => {
      term.writeln("\r\n\x1b[90mProcess exited. Press any key to restart.\x1b[0m");
    });

    term.onData((data) => {
      invoke("write_to_pty", { id: ptyId, data }).catch(() => {});
    });

    term.onResize(({ cols, rows }) => {
      invoke("resize_pty", { id: ptyId, cols, rows }).catch(() => {});
    });

    instances.current.set(id, { term, fitAddon, ptyId, unlisten });
    term.focus();
  }

  async function destroyTerminal(id: number) {
    const inst = instances.current.get(id);
    if (inst) {
      inst.unlisten?.();
      if (inst.ptyId !== null) {
        await invoke("kill_pty", { id: inst.ptyId }).catch(() => {});
      }
      inst.term.dispose();
      instances.current.delete(id);
    }
    initializedIds.current.delete(id);
    containerRefs.current.delete(id);
    callbackRefs.current.delete(id);
  }

  // Create first terminal on mount
  useEffect(() => {
    const id = ++tabIdCounter.current;
    setTabs([{ id, name: "Terminal 1" }]);
    setActiveTabId(id);

    return () => {
      for (const [, inst] of instances.current) {
        inst.unlisten?.();
        if (inst.ptyId !== null) {
          invoke("kill_pty", { id: inst.ptyId }).catch(() => {});
        }
        inst.term.dispose();
      }
    };
  }, []);

  // Refit active terminal when panel height changes
  useEffect(() => {
    if (activeTabId === null) return;
    const t = setTimeout(() => {
      instances.current.get(activeTabId)?.fitAddon.fit();
    }, 50);
    return () => clearTimeout(t);
  }, [terminalHeight, activeTabId]);

  function handleNewTerminal() {
    const id = ++tabIdCounter.current;
    const name = `Terminal ${id}`;
    setTabs((prev) => [...prev, { id, name }]);
    setActiveTabId(id);
  }

  async function handleCloseTab(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    await destroyTerminal(id);

    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        setTerminalVisible(false);
      } else if (activeTabId === id) {
        const idx = prev.findIndex((t) => t.id === id);
        const newActive = next[Math.min(idx, next.length - 1)].id;
        setActiveTabId(newActive);
        setTimeout(() => {
          const inst = instances.current.get(newActive);
          inst?.fitAddon.fit();
          inst?.term.focus();
        }, 0);
      }
      return next;
    });
  }

  function handleSwitchTab(id: number) {
    if (id === activeTabId) return;
    setActiveTabId(id);
    setTimeout(() => {
      const inst = instances.current.get(id);
      inst?.fitAddon.fit();
      inst?.term.focus();
    }, 0);
  }

  function handleClear() {
    if (activeTabId !== null) instances.current.get(activeTabId)?.term.clear();
  }

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] overflow-hidden">
      {/* Header with tabs and actions */}
      <div className="flex items-center h-8 bg-[#252526] border-t border-[#3e3e42] shrink-0 overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center flex-1 overflow-x-auto min-w-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleSwitchTab(tab.id)}
              className={`flex items-center justify-center gap-1.5 px-3 h-full text-sm shrink-0 group transition-colors ${
                activeTabId === tab.id
                  ? "text-[#cccccc] border-t border-t-[#007acc] bg-[#1a1a1a]"
                  : "text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e]"
              }`}
            >
              {tab.name}
              <span
                role="button"
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:text-white rounded transition-opacity"
              >
                <X size={10} />
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 px-2 shrink-0">
          <button
            onClick={handleNewTerminal}
            title="New Terminal"
            className="p-1 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] transition-colors"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={handleClear}
            title="Clear Terminal"
            className="p-1 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] transition-colors"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => setTerminalVisible(false)}
            title="Close Terminal (Ctrl+J)"
            className="p-1 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#2a2d2e] transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Terminal containers — all mounted, only active visible */}
      <div className="flex-1 overflow-hidden relative">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={getContainerRef(tab.id)}
            className="absolute inset-0"
            style={{
              display: activeTabId === tab.id ? "block" : "none",
              padding: "4px 8px",
            }}
            onClick={() => instances.current.get(tab.id)?.term.focus()}
          />
        ))}
      </div>
    </div>
  );
}
