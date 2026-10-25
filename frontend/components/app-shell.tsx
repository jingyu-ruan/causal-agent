"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  const workbench = usePathname() === "/studies/new"
  return <div className={workbench ? "app-frame is-workbench" : "app-frame"}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Sidebar />
    <main id="main-content" className="app-content">{children}</main>
  </div>
}
