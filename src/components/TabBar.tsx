import { X } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";
import { getFileIcon } from "../utils/fileIcons";

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useEditorStore();

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-end overflow-x-auto bg-[#2d2d30] border-b border-[#3e3e42] shrink-0 h-[35px]">
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
              flex items-center gap-1.5 px-3 h-[35px] cursor-pointer border-r border-[#3e3e42]
              min-w-[100px] max-w-[200px] shrink-0 group relative
              ${isActive
                ? "bg-[#1e1e1e] text-[#cccccc] border-t-2 border-t-[#007acc]"
                : "bg-[#2d2d30] text-[#858585] hover:bg-[#1e1e1e] hover:text-[#cccccc]"
              }
            `}
          >
            <span className="flex-shrink-0">{getFileIcon(fakeEntry as any)}</span>
            <span className="text-xs truncate flex-1">
              {tab.name}
              {tab.isDirty && <span className="text-[#007acc] ml-0.5">●</span>}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className={`
                flex-shrink-0 rounded p-0.5
                ${isActive ? "opacity-70 hover:opacity-100 hover:bg-[#2a2d2e]" : "opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-[#2a2d2e]"}
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
