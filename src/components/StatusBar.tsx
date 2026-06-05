import { Fish } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";

export function StatusBar() {
  const { tabs, activeTabId, settings } = useEditorStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const lines = activeTab?.content.split("\n").length ?? 0;

  return (
    <div
      className="flex items-center justify-between h-[22px] bg-[#000000] border-t border-[#003a00] mr-2 text-[#00ff41] text-[11px] shrink-0 select-none"
      style={{ textShadow: '0 0 4px rgba(0,255,65,0.6)', boxShadow: '0 -1px 0 #001a00', paddingLeft: '12px', paddingRight: '16px' }}
    >
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <Fish style={{ marginLeft: '10px', filter: 'drop-shadow(0 0 3px #00ff41)' }} size={11} />
          <span>Fish Editor</span>
        </span>
        {activeTab && (
          <span className="text-[#2d7a3a]">
            {activeTab.isDirty ? "● Modified" : "Saved"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[#2d7a3a]">
        {activeTab && (
          <>
            <span>{activeTab.language}</span>
            <span>Ln 1, Col 1</span>
            <span>{lines} lines</span>
            <span>UTF-8</span>
            <span>Spaces: {settings.tabSize}</span>
          </>
        )}
        {!activeTab && <span className="opacity-50">No file open</span>}
      </div>
    </div>
  );
}
