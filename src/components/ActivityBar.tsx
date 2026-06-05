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
    { id: "explorer" as Panel, icon: <Files size={16} />, title: "Explorer" },
    { id: "search" as Panel, icon: <Search size={16} />, title: "Search" },
    { id: "extensions" as Panel, icon: <Package size={16} />, title: "Extensions" },
  ];

  return (
    <div className="flex flex-row items-center h-9 bg-[#030303] border-b border-[#003a00] shrink-0 w-full gap-1" style={{ paddingLeft: '12px', paddingRight: '12px' }}>
      {items.map((item) => (
        <button
          key={item.id}
          title={item.title}
          onClick={() => handleClick(item.id)}
          className={`
            h-9 px-4 flex items-center justify-center gap-1.5 transition-colors relative text-xs
            ${activePanel === item.id && sidebarVisible && !settingsOpen
              ? "text-[#00ff41] after:absolute after:bottom-0 after:left-2 after:right-2 after:h-[2px] after:bg-[#00ff41]"
              : "text-[#2d7a3a] hover:text-[#00ff41]"
            }
          `}
          style={activePanel === item.id && sidebarVisible && !settingsOpen
            ? { filter: 'drop-shadow(0 0 4px #00ff41)', paddingLeft: '8px', paddingRight: '8px' }
            : undefined
          }
        >
          {item.icon}
          <span className="uppercase tracking-wider">{item.title}</span>
        </button>
      ))}

      <div className="flex-1" />

      <button
        title="Settings"
        onClick={handleSettings}
        className={`
          h-9 px-4 flex items-center justify-center gap-1.5 transition-colors relative text-xs
          ${settingsOpen
            ? "text-[#00ff41] after:absolute after:bottom-0 after:left-2 after:right-2 after:h-[2px] after:bg-[#00ff41]"
            : "text-[#2d7a3a] hover:text-[#00ff41]"
          }
        `}
        style={settingsOpen ? { filter: 'drop-shadow(0 0 4px #00ff41)' } : undefined}
      >
        <Settings size={16} />
        <span className="uppercase tracking-wider">Settings</span>
      </button>
    </div>
  );
}
