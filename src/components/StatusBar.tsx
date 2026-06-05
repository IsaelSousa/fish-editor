import { Fish } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";

export function StatusBar() {
  const { tabs, activeTabId, settings } = useEditorStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const lines = activeTab?.content.split("\n").length ?? 0;

  return (
    <div className="flex items-center justify-between h-[22px] bg-[#007acc] text-white text-[11px] px-3 shrink-0 select-none">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 opacity-90">
          <Fish style={{ marginLeft: '10px' }} size={11} />
          <span>Fish Editor</span>
        </span>
        {activeTab && (
          <span className="opacity-75">
            {activeTab.isDirty ? "● Modified" : "Saved"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 opacity-90">
        {activeTab && (
          <>
            <span>{activeTab.language}</span>
            <span>Ln 1, Col 1</span>
            <span>{lines} lines</span>
            <span>UTF-8</span>
            <span>Spaces: {settings.tabSize}</span>
          </>
        )}
        {!activeTab && <span className="opacity-70">No file open</span>}
      </div>
    </div>
  );
}
