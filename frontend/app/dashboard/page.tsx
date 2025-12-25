"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search, Activity, check, AlertTriangle, Calculator, FlaskConical, BarChart3, Brain } from "lucide-react"

// --- Mock Data for Pipeline ---
const experiments = [
  { id: 1, name: "Checkout Flow v2", owner: "Alice", status: "Running", metric: "Conversion", progress: 65 },
  { id: 2, name: "New Pricing Tier", owner: "Bob", status: "Drafting", metric: "Revenue", progress: 0 },
  { id: 3, name: "Homepage Hero", owner: "Charlie", status: "Analyzing", metric: "Click-through", progress: 100 },
  { id: 4, name: "Recommendation Algo", owner: "Alice", status: "Concluded", metric: "Retention", progress: 100 },
  { id: 5, name: "Dark Mode", owner: "Dave", status: "Running", metric: "Engagement", progress: 23 },
]

const statuses = ["Drafting", "Running", "Analyzing", "Concluded"]

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Activity className="h-8 w-8 text-indigo-600" />
            Mission Control
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Overview of all experimental initiatives.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Refresh Data</Button>
          <Button>New Experiment</Button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Zone A: Experiment Pipeline (8 cols) */}
        <div className="xl:col-span-8 space-y-6">
          <Card className="h-full border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle>Experiment Pipeline</CardTitle>
              <CardDescription>Kanban view of active experiments.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[600px] overflow-y-auto">
                {statuses.map((status) => (
                  <div key={status} className="flex flex-col gap-3 bg-slate-100 dark:bg-slate-900/50 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-300 uppercase tracking-wider">{status}</h3>
                      <span className="text-xs bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-400">
                        {experiments.filter(e => e.status === status).length}
                      </span>
                    </div>
                    {experiments.filter(e => e.status === status).map((exp) => (
                      <Card key={exp.id} className="shadow-sm hover:shadow-md transition-shadow cursor-pointer border-slate-200 dark:border-slate-700">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex justify-between items-start">
                            <h4 className="font-medium text-sm leading-tight">{exp.name}</h4>
                            {status === "Running" && <Activity className="h-3 w-3 text-emerald-500 animate-pulse" />}
                          </div>
                          <div className="text-xs text-slate-500 flex justify-between">
                            <span>{exp.owner}</span>
                            <span>{exp.metric}</span>
                          </div>
                          {status === "Running" && (
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-2">
                              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${exp.progress}%` }}></div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (4 cols) */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Zone B: AI Insights (The Brain) */}
          <Card className="border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                <Brain className="h-5 w-5" />
                The Brain
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Ask insights from past experiments..." 
                  className="pl-9 border-indigo-200 dark:border-indigo-800 focus-visible:ring-indigo-500"
                />
              </div>
              
              <div className="space-y-3 mt-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase">Recent Insights</h4>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 text-sm shadow-sm">
                  <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">Checkout Rate Drivers</p>
                  <p className="text-slate-600 dark:text-slate-400 text-xs">
                    Analysis suggests that reducing steps on mobile (iOS) increases conversion by 12% (p &lt; 0.01).
                  </p>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 text-sm shadow-sm">
                  <p className="font-medium text-slate-800 dark:text-slate-200 mb-1">Pricing Sensitivity</p>
                  <p className="text-slate-600 dark:text-slate-400 text-xs">
                    Users in DACH region showed negative reaction to new pricing tiers.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Zone C: Toolkit */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Toolkit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Mini Sample Size Calculator */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-slate-500" />
                  Sample Size Estimator
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="baseline" className="text-xs">Baseline (%)</Label>
                    <Input id="baseline" placeholder="e.g. 10" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mde" className="text-xs">MDE (%)</Label>
                    <Input id="mde" placeholder="e.g. 2" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded text-center">
                  <span className="text-xs text-slate-500">Required N per variant</span>
                  <p className="font-bold text-lg text-slate-800 dark:text-slate-200">3,800</p>
                </div>
              </div>

              <hr className="border-slate-100 dark:border-slate-800" />

              {/* SRM Checker */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-slate-500" />
                  SRM Checker
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="n-control" className="text-xs">Control N</Label>
                    <Input id="n-control" placeholder="1000" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="n-treatment" className="text-xs">Treat N</Label>
                    <Input id="n-treatment" placeholder="950" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 rounded text-xs flex items-center gap-2">
                   <AlertTriangle className="h-3 w-3" />
                   Potential mismatch detected (p=0.04)
                </div>
              </div>

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
