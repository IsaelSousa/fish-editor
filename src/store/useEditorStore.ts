import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Tab, FileEntry, EditorSettings } from "../types";
import { getLanguageFromPath } from "../utils/language";

interface EditorStore {
  workspacePath: string | null;
  fileTree: FileEntry[];
  expandedDirs: Set<string>;
  tabs: Tab[];
  activeTabId: string | null;
  sidebarVisible: boolean;
  sidebarWidth: number;
  settings: EditorSettings;
  commandPaletteOpen: boolean;
  searchQuery: string;
  terminalVisible: boolean;
  terminalHeight: number;
  recentFolders: string[];
  settingsOpen: boolean;

  setWorkspacePath: (path: string | null) => void;
  addRecentFolder: (path: string) => void;
  setFileTree: (tree: FileEntry[]) => void;
  updateDirChildren: (dirPath: string, children: FileEntry[]) => void;
  toggleDir: (path: string) => void;
  openTab: (path: string, name: string, content: string, isImage?: boolean) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  markTabSaved: (id: string) => void;
  setSidebarVisible: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  updateSettings: (s: Partial<EditorSettings>) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSearchQuery: (q: string) => void;
  closeAllTabs: () => void;
  gotoLine: number | null;
  setGotoLine: (line: number | null) => void;
  setTerminalVisible: (v: boolean) => void;
  setTerminalHeight: (h: number) => void;
  setSettingsOpen: (open: boolean) => void;
}

let tabCounter = 0;

function updateTreeNode(
  nodes: FileEntry[],
  dirPath: string,
  children: FileEntry[]
): FileEntry[] {
  return nodes.map((node) => {
    if (node.path === dirPath) {
      return { ...node, children };
    }
    if (node.children) {
      return { ...node, children: updateTreeNode(node.children, dirPath, children) };
    }
    return node;
  });
}

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      workspacePath: null,
      fileTree: [],
      expandedDirs: new Set(),
      tabs: [],
      activeTabId: null,
      sidebarVisible: true,
      sidebarWidth: 260,
      commandPaletteOpen: false,
      searchQuery: "",
      gotoLine: null,
      terminalVisible: false,
      terminalHeight: 220,
      recentFolders: [],
      settingsOpen: false,
      settings: {
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
        fontColor: "#d4d4d4",
        tabSize: 8,
        wordWrap: "on",
        minimap: false,
        lineNumbers: "on",
        theme: "vs-dark",
        fileIconSize: 16,
        headerIconSize: 16,
        fileTreeFontSize: 13,
      },

      setWorkspacePath: (path) => set({ workspacePath: path }),
      addRecentFolder: (path) =>
        set((state) => {
          const next = [path, ...state.recentFolders.filter((p) => p !== path)];
          return { recentFolders: Array.from(new Set(next)).slice(0, 3) };
        }),
      setFileTree: (tree) => set({ fileTree: tree }),

      updateDirChildren: (dirPath, children) =>
        set((state) => ({
          fileTree: updateTreeNode(state.fileTree, dirPath, children),
        })),

      toggleDir: (path) =>
        set((state) => {
          const next = new Set(state.expandedDirs);
          if (next.has(path)) {
            next.delete(path);
          } else {
            next.add(path);
          }
          return { expandedDirs: next };
        }),

      openTab: (path, name, content, isImage?: boolean) => {
        const { tabs } = get();
        const existing = tabs.find((t) => t.path === path);
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }
        const id = `tab-${++tabCounter}`;
        const language = isImage ? "plaintext" : getLanguageFromPath(path);
        const newTab: Tab = { id, path, name, content, isDirty: false, language, isImage };
        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id,
        }));
      },

      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        const idx = tabs.findIndex((t) => t.id === id);
        const newTabs = tabs.filter((t) => t.id !== id);
        let newActiveId = activeTabId;
        if (activeTabId === id) {
          if (newTabs.length === 0) {
            newActiveId = null;
          } else if (idx > 0) {
            newActiveId = newTabs[idx - 1].id;
          } else {
            newActiveId = newTabs[0].id;
          }
        }
        set({ tabs: newTabs, activeTabId: newActiveId });
      },

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTabContent: (id, content) =>
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id ? { ...t, content, isDirty: true } : t
          ),
        })),

      markTabSaved: (id) =>
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id ? { ...t, isDirty: false } : t
          ),
        })),

      setSidebarVisible: (v) => set({ sidebarVisible: v }),
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      updateSettings: (s) =>
        set((state) => ({ settings: { ...state.settings, ...s } })),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      closeAllTabs: () => set({ tabs: [], activeTabId: null }),
      setGotoLine: (line) => set({ gotoLine: line }),
      setTerminalVisible: (v) => set({ terminalVisible: v }),
      setTerminalHeight: (h) => set({ terminalHeight: h }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
    }),
    {
      name: "fish-editor-storage",
      partialize: (state) => ({
        recentFolders: state.recentFolders,
        settings: state.settings,
      }),
    }
  )
);
