export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileEntry[];
  extension?: string;
}

export interface Tab {
  id: string;
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: string;
  isImage?: boolean;
}

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  tabSize: number;
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
  minimap: boolean;
  lineNumbers: "on" | "off" | "relative";
  theme: "vs-dark" | "light" | "hc-black";
  fileIconSize: number;
  headerIconSize: number;
  fileTreeFontSize: number;
}

export interface AppState {
  workspacePath: string | null;
  fileTree: FileEntry[];
  tabs: Tab[];
  activeTabId: string | null;
  sidebarVisible: boolean;
  settings: EditorSettings;
}
