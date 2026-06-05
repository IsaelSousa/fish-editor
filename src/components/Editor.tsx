import MonacoEditor, { OnMount } from "@monaco-editor/react";
import { useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/useEditorStore";
import { Fish } from "lucide-react";

function buildFishDarkTheme(fontColor: string) {
  return {
    base: "vs-dark" as const,
    inherit: true,
    rules: [
      { token: "comment", foreground: "6a9955" },
      { token: "keyword", foreground: "569cd6" },
      { token: "string", foreground: "ce9178" },
      { token: "number", foreground: "b5cea8" },
      { token: "type", foreground: "4ec9b0" },
    ],
    colors: {
      "editor.background": "#1e1e1e",
      "editor.foreground": fontColor,
      "editor.lineHighlightBackground": "#2a2d2e",
      "editor.selectionBackground": "#264f78",
      "editorLineNumber.foreground": "#858585",
      "editorLineNumber.activeForeground": "#c6c6c6",
      "editorCursor.foreground": "#aeafad",
      "editor.findMatchBackground": "#515c6a",
      "editor.findMatchHighlightBackground": "#ea5c0055",
      "editorBracketMatch.background": "#0064001a",
      "editorBracketMatch.border": "#888",
      "scrollbarSlider.background": "#424242aa",
      "scrollbarSlider.hoverBackground": "#555555aa",
      "scrollbarSlider.activeBackground": "#777777aa",
    },
  };
}

export function Editor() {
  const { tabs, activeTabId, updateTabContent, settings } = useEditorStore();

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
        const tab = useEditorStore.getState().tabs.find(
          (t) => t.id === useEditorStore.getState().activeTabId
        );
        if (!tab) return;
        await invoke("write_file", { path: tab.path, content: tab.content });
        useEditorStore.getState().markTabSaved(tab.id);
      });

      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
        () => {
          useEditorStore.getState().setCommandPaletteOpen(true);
        }
      );

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => {
        const state = useEditorStore.getState();
        state.setTerminalVisible(!state.terminalVisible);
      });

      // Disable semantic validation so the editor doesn't try to resolve
      // imports from projects being edited (which have their own node_modules)
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });

      const { fontColor } = useEditorStore.getState().settings;
      monaco.editor.defineTheme("fish-dark", buildFishDarkTheme(fontColor));
      monaco.editor.setTheme("fish-dark");
    },
    []
  );

  useEffect(() => {
    if (!monacoRef.current) return;
    monacoRef.current.editor.defineTheme("fish-dark", buildFishDarkTheme(settings.fontColor));
    monacoRef.current.editor.setTheme("fish-dark");
  }, [settings.fontColor]);

  if (!activeTab) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#1e1e1e] text-[#858585] gap-4">
        <Fish size={64} className="opacity-10 text-[#007acc]" />
        <div className="text-center">
          <h2 className="text-[#cccccc] text-xl font-light mb-2">Fish Editor</h2>
          <p className="text-sm opacity-60">Open a file from the explorer to start editing</p>
          <div className="mt-6 space-y-2 text-xs opacity-50">
            <p><kbd className="bg-[#3c3c3c] px-1.5 py-0.5 rounded">Ctrl+O</kbd> Open Folder</p>
            <p><kbd className="bg-[#3c3c3c] px-1.5 py-0.5 rounded">Ctrl+S</kbd> Save File</p>
            <p><kbd className="bg-[#3c3c3c] px-1.5 py-0.5 rounded">Ctrl+Shift+P</kbd> Command Palette</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <MonacoEditor
        key={activeTab.id}
        height="100%"
        language={activeTab.language}
        value={activeTab.content}
        onMount={handleMount}
        onChange={(value) => {
          if (value !== undefined) {
            updateTabContent(activeTab.id, value);
          }
        }}
        options={{
          fontSize: settings.fontSize,
          fontFamily: settings.fontFamily,
          tabSize: settings.tabSize,
          wordWrap: settings.wordWrap,
          minimap: { enabled: settings.minimap },
          lineNumbers: settings.lineNumbers,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fontLigatures: true,
          renderLineHighlight: "line",
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          suggest: {
            showKeywords: true,
            showSnippets: true,
          },
          inlineSuggest: { enabled: true },
          formatOnPaste: true,
          formatOnType: false,
          padding: { top: 8, bottom: 8 },
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        }}
      />
    </div>
  );
}
