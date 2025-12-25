"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, PlusCircle, BarChart2, Settings, Beaker, FileSpreadsheet } from "lucide-react"
import { cn } from "@/lib/utils"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Settings", href: "/settings", icon: Settings },
]

const abTools = [
    { name: "New Experiment", href: "/abtest/new", icon: Beaker },
    { name: "Data Analysis", href: "/analysis", icon: BarChart2 },
]

const causalTools = [
    { name: "Observational Study", href: "/observational/new", icon: FileSpreadsheet },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex w-64 flex-col border-r bg-white dark:bg-slate-900 dark:border-slate-800">
      <div className="flex h-16 items-center border-b px-6 dark:border-slate-800">
        <Beaker className="mr-2 h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        <Link href="/" className="text-lg font-bold text-slate-900 dark:text-slate-50 hover:opacity-80 transition-opacity">
            Causal Agent
        </Link>
      </div>
      <nav className="flex-1 space-y-6 px-3 py-4 overflow-y-auto">
        
        {/* Main Nav */}
        <div className="space-y-1">
            {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
                <Link
                key={item.name}
                href={item.href}
                className={cn(
                    "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                    ? "bg-slate-100 text-indigo-600 dark:bg-slate-800 dark:text-indigo-400"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                )}
                >
                <item.icon
                    className={cn(
                    "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                    isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400"
                    )}
                />
                {item.name}
                </Link>
            )
            })}
        </div>

        {/* A/B Tools */}
        <div className="space-y-1">
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Experimentation
            </h3>
            {abTools.map((item) => {
            const isActive = pathname === item.href
            return (
                <Link
                key={item.name}
                href={item.href}
                className={cn(
                    "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                    ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                )}
                >
                <item.icon
                    className={cn(
                    "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                    isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400"
                    )}
                />
                {item.name}
                </Link>
            )
            })}
        </div>

        {/* Causal Tools */}
        <div className="space-y-1">
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Causal Inference
            </h3>
            {causalTools.map((item) => {
            const isActive = pathname === item.href
            return (
                <Link
                key={item.name}
                href={item.href}
                className={cn(
                    "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                )}
                >
                <item.icon
                    className={cn(
                    "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                    isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400"
                    )}
                />
                {item.name}
                </Link>
            )
            })}
        </div>

      </nav>
      <div className="border-t p-4 dark:border-slate-800">
        <div className="flex items-center">
          <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="ml-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">User</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">user@example.com</p>
          </div>
        </div>
      </div>
    </div>
  )
}
