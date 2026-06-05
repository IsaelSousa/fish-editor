import { Files, Search, Settings, Package } from "lucide-react";
import { useEditorStore } from "../store/useEditorStore";

type Panel = "explorer" | "search" | "extensions";

interface ActivityBarProps {
  activePanel: Panel;
  setActivePanel: (p: Panel) => void;
}

export function ActivityBar({ activePanel, setActivePanel }: ActivityBarProps) {
  const { sidebarVisible, setSidebarVisible, settingsOpen, setSettingsOpen } = useEditorStore();

  function handleClick(panel: Panel) {
    if (settingsOpen) setSettingsOpen(false);
    if (activePanel === panel && sidebarVisible) {
      setSidebarVisible(false);
    } else {
      setSidebarVisible(true);
      setActivePanel(panel);
    }
  }

  function handleSettings() {
    setSettingsOpen(!settingsOpen);
  }

  const items = [
    { id: "explorer" as Panel, icon: <Files size={22} />, title: "Explorer" },
    { id: "search" as Panel, icon: <Search size={22} />, title: "Search" },
    { id: "extensions" as Panel, icon: <Package size={22} />, title: "Extensions" },
  ];

  return (
    <div className="flex flex-col items-center w-12 bg-[#333333] border-r border-[#3e3e42] shrink-0 py-1">
      {items.map((item) => (
        <button
          key={item.id}
          title={item.title}
          onClick={() => handleClick(item.id)}
          className={`
            w-12 h-12 flex items-center justify-center transition-colors relative
            ${activePanel === item.id && sidebarVisible && !settingsOpen
              ? "text-[#cccccc] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#007acc]"
              : "text-[#858585] hover:text-[#cccccc]"
            }
          `}
        >
          {item.icon}
        </button>
      ))}

      <div className="flex-1" />

      <button
        title="Settings"
        onClick={handleSettings}
        className={`
          w-12 h-12 flex items-center justify-center transition-colors relative
          ${settingsOpen
            ? "text-[#cccccc] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#007acc]"
            : "text-[#858585] hover:text-[#cccccc]"
          }
        `}
      >
        <Settings size={22} />
      </button>
    </div>
  );
}
