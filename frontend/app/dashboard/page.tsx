"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search, Calculator, FlaskConical, Brain, Loader2 } from "lucide-react"

export default function DashboardPage() {
  // Brain State
  const [brainQuery, setBrainQuery] = useState("")
  const [brainAnswer, setBrainAnswer] = useState<string | null>(null)
  const [brainLoading, setBrainLoading] = useState(false)

  // Toolkit State
  const [baseline, setBaseline] = useState("")
  const [mde, setMde] = useState("")
  const [sampleSize, setSampleSize] = useState<number | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)

  const handleBrainAsk = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!brainQuery.trim()) return

    setBrainLoading(true)
    setBrainAnswer(null)

    try {
      const res = await fetch("http://localhost:8000/brain/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: brainQuery }),
      })
      const data = await res.json()
      setBrainAnswer(data.answer)
    } catch (error) {
      setBrainAnswer("Sorry, I encountered an error connecting to the brain.")
    } finally {
      setBrainLoading(false)
    }
  }

  // Real-time calculation effect
  useEffect(() => {
    const calculate = async () => {
      const b = parseFloat(baseline)
      const m = parseFloat(mde)
      
      if (isNaN(b) || isNaN(m) || b <= 0 || m <= 0) {
        setSampleSize(null)
        return
      }

      setCalcLoading(true)
      try {
        const res = await fetch("http://localhost:8000/design/power", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseline_rate: b / 100,
            mde_abs: m / 100,
            alpha: 0.05,
            power: 0.8,
            two_sided: true
          }),
        })
        const data = await res.json()
        setSampleSize(data.n_per_group)
      } catch (error) {
        console.error(error)
      } finally {
        setCalcLoading(false)
      }
    }

    const timer = setTimeout(calculate, 500) // Debounce 500ms
    return () => clearTimeout(timer)
  }, [baseline, mde])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
          Mission Control
        </h1>
        <p className="text-slate-500 dark:text-slate-400">Overview of all experimental initiatives.</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Zone B: AI Insights (The Brain) */}
        <Card className="border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
              <Brain className="h-5 w-5" />
              The Brain
            </CardTitle>
            <CardDescription>Ask questions about causal inference or experiment design.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleBrainAsk} className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input 
                value={brainQuery}
                onChange={(e) => setBrainQuery(e.target.value)}
                placeholder="Ask insights from past experiments..." 
                className="pl-9 pr-20 border-indigo-200 dark:border-indigo-800 focus-visible:ring-indigo-500"
              />
              <Button 
                type="submit" 
                size="sm" 
                className="absolute right-1 top-1 h-8" 
                disabled={brainLoading}
              >
                {brainLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
              </Button>
            </form>
            
            {brainAnswer && (
              <div className="p-4 bg-white dark:bg-slate-900 rounded-md border border-indigo-100 dark:border-indigo-900 shadow-sm animate-in fade-in slide-in-from-top-2">
                <h4 className="text-xs font-semibold text-indigo-500 uppercase mb-2">Answer</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {brainAnswer}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zone C: Toolkit */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Toolkit
            </CardTitle>
            <CardDescription>Quick calculations for experiment planning.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Mini Sample Size Calculator */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-slate-500" />
                Sample Size Estimator
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="baseline" className="text-xs">Baseline Conversion (%)</Label>
                  <Input 
                    id="baseline" 
                    type="number"
                    value={baseline}
                    onChange={(e) => setBaseline(e.target.value)}
                    placeholder="e.g. 10" 
                    className="h-9 text-sm" 
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mde" className="text-xs">Minimum Detectable Effect (%)</Label>
                  <Input 
                    id="mde" 
                    type="number"
                    value={mde}
                    onChange={(e) => setMde(e.target.value)}
                    placeholder="e.g. 2" 
                    className="h-9 text-sm" 
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded text-center transition-all">
                <span className="text-xs text-slate-500 uppercase tracking-wide">Required Sample Size (Per Variant)</span>
                <div className="mt-1 flex items-center justify-center h-8">
                  {calcLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  ) : (
                    <p className="font-bold text-2xl text-slate-800 dark:text-slate-200">
                      {sampleSize ? sampleSize.toLocaleString() : "--"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
