export type TabType = "daily" | "history" | "aliases";

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onOpenSettings: () => void;
}

export function BottomNav({ activeTab, onTabChange, onOpenSettings }: BottomNavProps) {
  const tabs = [
    { id: "daily" as TabType, label: "Bugün", icon: "🏠" },
    { id: "history" as TabType, label: "Geçmiş", icon: "📊" },
    { id: "aliases" as TabType, label: "Hafıza", icon: "🧠" },
    { id: "settings" as const, label: "Ayarlar", icon: "⚙️" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-calBorder bg-[#0D0D14]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2 sm:max-w-lg">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const isSettings = tab.id === "settings";

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (isSettings) {
                  onOpenSettings();
                } else {
                  onTabChange(tab.id as TabType);
                }
              }}
              className={`flex flex-col items-center justify-center py-1 px-3 transition-colors duration-200 ${
                isActive ? "text-white font-bold" : "text-[#8E8E93] hover:text-white/80 font-normal"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="mt-1 text-[10px] tracking-wide">{tab.label}</span>
              {isActive && (
                <span className="mt-0.5 h-1 w-1 rounded-full bg-[#4DD4E6] shadow-[0_0_6px_#4DD4E6]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
