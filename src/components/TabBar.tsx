import { X } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";
import { getFileIcon } from "../utils/fileIcons";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useEditorStore();

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-end overflow-x-auto bg-[#080808] border-b border-[#003a00] shrink-0 h-[35px]">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const fakeEntry = {
          name: tab.name,
          path: tab.path,
          is_dir: false,
          extension: tab.name.includes(".") ? tab.name.split(".").pop() : undefined,
        };

        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-1.5 px-3 h-[35px] cursor-pointer border-r border-[#003a00]
              min-w-[100px] max-w-[200px] shrink-0 group relative
              ${isActive
                ? "bg-[#000000] text-[#00ff41] border-t-2 border-t-[#00ff41]"
                : "bg-[#080808] text-[#2d7a3a] hover:bg-[#020202] hover:text-[#00ff41]"
              }
            `}
            style={isActive ? { textShadow: '0 0 4px rgba(0,255,65,0.5)' } : undefined}
          >
            <span className="flex-shrink-0">{getFileIcon(fakeEntry as any)}</span>
            <span className="text-sm truncate flex-1">
              {tab.name}
              {tab.isDirty && <span className="text-[#00ff41] ml-0.5" style={{ textShadow: '0 0 6px #00ff41' }}>●</span>}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className={`
                flex-shrink-0 p-0.5 text-[#2d7a3a] hover:text-[#00ff41]
                ${isActive ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-70 hover:opacity-100"}
              `}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
