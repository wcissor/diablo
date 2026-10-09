"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Menu as MenuIcon, Plus } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useWorkspace } from "@/lib/data";
import { isComposing, isTypingTarget } from "@/lib/platform";
import { isSidebarCollapsed, setSidebarCollapsed } from "@/lib/prefs";
import { ui, useUI } from "@/lib/ui";
import { CommandPalette } from "./CommandPalette";
import { PAGE_TITLES } from "./nav";
import { ShortcutsDialog, StorageBanner, Toasts } from "./Overlays";
import { SidebarContent } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  useGlobalShortcuts();
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="app-frame flex h-dvh overflow-hidden">
        <aside className="sidebar no-print hidden h-dvh shrink-0 flex-col border-r border-line bg-subtle dark:bg-black md:flex">
          <SidebarContent variant="desktop" />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileBar />
          <StorageBanner />
          <main id="main" tabIndex={-1} className="app-main quiet-scroll relative min-h-0 flex-1 overflow-y-auto outline-none">
            {children}
          </main>
        </div>
      </div>
      <MobileDrawer />
      <CommandPalette />
      <ShortcutsDialog />
      <Toasts />
    </>
  );
}

/** Ctrl/⌘+K, Ctrl/⌘+\ and ?. Matched by event.code so they work on any keyboard layout. */
function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isComposing(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        ui.setPalette(true);
        return;
      }
      if (mod && !e.altKey && e.code === "Backslash") {
        e.preventDefault();
        setSidebarCollapsed(!isSidebarCollapsed());
        return;
      }
      if (e.key === "?" && !mod && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        ui.setShortcuts(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function MobileBar() {
  const pathname = usePathname();
  const router = useRouter();
  const ws = useWorkspace();
  const invId = pathname.startsWith("/investigations/") ? decodeURIComponent(pathname.split("/")[2] ?? "") : null;
  const title = invId
    ? (ws.investigations.find((i) => i.id === invId)?.title ?? "Investigation")
    : (PAGE_TITLES[pathname] ?? "");
  return (
    <div className="no-print flex h-12 shrink-0 items-center gap-1 border-b border-line bg-bg px-2 md:hidden">
      <IconButton label="Open menu" icon={<MenuIcon strokeWidth={1.5} />} onClick={() => ui.setDrawer(true)} className="size-11" />
      <div className="min-w-0 flex-1 truncate text-center text-[14px] font-medium text-ink">{title}</div>
      <IconButton
        label="New investigation"
        icon={<Plus strokeWidth={1.5} />}
        onClick={() => router.push("/home?new=1")}
        className="size-11"
      />
    </div>
  );
}

function MobileDrawer() {
  const open = useUI((s) => s.drawer);
  const pathname = usePathname();
  // Close when the route changes (a link inside was followed).
  useEffect(() => {
    ui.setDrawer(false);
  }, [pathname]);
  return (
    <Dialog open={open} onOpenChange={ui.setDrawer} title="Menu" hideTitle variant="sheet-left">
      <SidebarContent variant="drawer" onNavigate={() => ui.setDrawer(false)} />
    </Dialog>
  );
}
