import { useEffect, useRef, useCallback } from "react";
import { useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { ActivityBar } from "./components/ActivityBar";
import { FileTree } from "./components/FileTree";
import { SearchPanel } from "./components/SearchPanel";
import { TabBar } from "./components/TabBar";
import { Editor } from "./components/Editor";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { TerminalPanel } from "./components/TerminalPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { WelcomePage } from "./components/WelcomePage";
import { GitPanel } from "./components/GitPanel";
import { useEditorStore } from "./store/useEditorStore";
import { invoke } from "@tauri-apps/api/core";

type Panel = "explorer" | "search" | "git" | "extensions";

export default function App() {
  const [activePanel, setActivePanel] = useState<Panel>("explorer");
  const {
    workspacePath,
    sidebarVisible,
    sidebarWidth,
    setSidebarWidth,
    setSidebarVisible,
    setCommandPaletteOpen,
    terminalVisible,
    terminalHeight,
    setTerminalVisible,
    setTerminalHeight,
    settingsOpen,
  } = useEditorStore();

  // Sidebar resize
  const sidebarResizing = useRef(false);
  const sidebarStartX = useRef(0);
  const sidebarStartWidth = useRef(0);

  // Terminal resize
  const termResizing = useRef(false);
  const termStartY = useRef(0);
  const termStartHeight = useRef(0);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "p") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const state = useEditorStore.getState();
        const tab = state.tabs.find((t) => t.id === state.activeTabId);
        if (tab) {
          invoke("write_file", { path: tab.path, content: tab.content }).then(() => {
            state.markTabSaved(tab.id);
          });
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setSidebarVisible(!useEditorStore.getState().sidebarVisible);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        const state = useEditorStore.getState();
        if (state.activeTabId) state.closeTab(state.activeTabId);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        const state = useEditorStore.getState();
        setTerminalVisible(!state.terminalVisible);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sidebar resize handlers
  const onSidebarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      sidebarResizing.current = true;
      sidebarStartX.current = e.clientX;
      sidebarStartWidth.current = sidebarWidth;
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    },
    [sidebarWidth]
  );

  // Terminal resize handlers
  const onTerminalMouseDown = useCallback(
    (e: React.MouseEvent) => {
      termResizing.current = true;
      termStartY.current = e.clientY;
      termStartHeight.current = terminalHeight;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    },
    [terminalHeight]
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (sidebarResizing.current) {
        const delta = e.clientX - sidebarStartX.current;
        const w = Math.max(160, Math.min(500, sidebarStartWidth.current + delta));
        setSidebarWidth(w);
      }
      if (termResizing.current) {
        const delta = termStartY.current - e.clientY;
        const h = Math.max(80, Math.min(600, termStartHeight.current + delta));
        setTerminalHeight(h);
      }
    }
    function onMouseUp() {
      sidebarResizing.current = false;
      termResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-black overflow-hidden">
      <TitleBar />
      {workspacePath && <ActivityBar activePanel={activePanel} setActivePanel={setActivePanel} />}

      {!workspacePath ? (
        <WelcomePage />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          {sidebarVisible && (
            <div
              className="flex flex-col bg-[#050505] border-r border-[#003a00] overflow-hidden shrink-0"
              style={{ width: sidebarWidth }}
            >
              {activePanel === "explorer" && <FileTree />}
              {activePanel === "search" && <SearchPanel />}
              {activePanel === "extensions" && (
                <div className="flex flex-col items-center justify-center h-full text-[#2d7a3a] text-xs px-4 gap-3">
                  <span className="text-4xl opacity-20">■</span>
                  <p className="text-center uppercase tracking-widest">Extensions coming soon</p>
                </div>
              )}
            </div>
          )}

          {/* Sidebar resize handle */}
          {sidebarVisible && (
            <div
              onMouseDown={onSidebarMouseDown}
              className="w-[2px] bg-transparent hover:bg-[#00ff41] cursor-ew-resize transition-colors shrink-0"
            />
          )}

          {/* Main area: editor + terminal */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {activePanel !== "git" && !settingsOpen && <TabBar />}

            {/* Editor area */}
            <div className="flex-1 overflow-hidden min-h-0">
              {settingsOpen
                ? <SettingsPanel />
                : activePanel === "git"
                  ? <GitPanel />
                  : <Editor />
              }
            </div>

            {/* Terminal resize handle */}
            {terminalVisible && (
              <div
                onMouseDown={onTerminalMouseDown}
                className="h-[2px] bg-transparent hover:bg-[#00ff41] cursor-ns-resize transition-colors shrink-0"
              />
            )}

            {/* Terminal panel */}
            {terminalVisible && (
              <div
                className="shrink-0 overflow-hidden border-t border-[#003a00]"
                style={{ height: terminalHeight }}
              >
                <TerminalPanel />
              </div>
            )}
          </div>
        </div>
      )}

      <StatusBar />
      <CommandPalette />
    </div>
  );
}
