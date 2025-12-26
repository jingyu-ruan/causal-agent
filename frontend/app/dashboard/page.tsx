"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search, Calculator, FlaskConical, Brain, Loader2, Upload, FileText } from "lucide-react"
import ReactMarkdown from "react-markdown"

export default function DashboardPage() {
  // Brain State
  const [brainQuery, setBrainQuery] = useState("")
  const [brainAnswer, setBrainAnswer] = useState<string | null>(null)
  const [brainLoading, setBrainLoading] = useState(false)
  const [brainFile, setBrainFile] = useState<File | null>(null)

  // Toolkit State
  const [baseline, setBaseline] = useState("")
  const [mde, setMde] = useState("")
  const [sampleSize, setSampleSize] = useState<number | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)

  const handleBrainAsk = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!brainQuery.trim() && !brainFile) return

    setBrainLoading(true)
    setBrainAnswer(null)

    try {
      const formData = new FormData()
      formData.append("query", brainQuery)
      if (brainFile) {
        formData.append("file", brainFile)
      }

      const res = await fetch("http://localhost:8000/api/brain/ask", {
        method: "POST",
        body: formData,
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
        const res = await fetch("http://localhost:8000/api/design/power", {
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
        setSampleSize(null)
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
            <CardDescription>Ask questions about causal inference or analyze uploaded files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleBrainAsk} className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  value={brainQuery}
                  onChange={(e) => setBrainQuery(e.target.value)}
                  placeholder="Ask insights or describe your data..." 
                  className="pl-9 border-indigo-200 dark:border-indigo-800 focus-visible:ring-indigo-500 bg-white dark:bg-slate-900"
                />
              </div>
              
              <div className="flex items-center gap-2">
                 <div className="relative flex-1">
                    <Input 
                        type="file" 
                        onChange={(e) => setBrainFile(e.target.files?.[0] || null)}
                        className="cursor-pointer text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                 </div>
                 <Button 
                    type="submit" 
                    disabled={brainLoading || (!brainQuery.trim() && !brainFile)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                 >
                    {brainLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
                 </Button>
              </div>
            </form>
            
            {/* Output Area */}
            <div className="mt-6">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                    AI Response
                </Label>
                <div className="min-h-[100px] p-4 bg-white dark:bg-slate-900 rounded-md border border-indigo-100 dark:border-indigo-900 shadow-sm">
                    {brainAnswer ? (
                        <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed animate-in fade-in">
                            <ReactMarkdown
                                components={{
                                    h1: ({node, ...props}) => <h1 className="text-xl font-bold mt-4 mb-2" {...props} />,
                                    h2: ({node, ...props}) => <h2 className="text-lg font-semibold mt-3 mb-2" {...props} />,
                                    h3: ({node, ...props}) => <h3 className="text-base font-medium mt-2 mb-1" {...props} />,
                                    ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2" {...props} />,
                                    ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2" {...props} />,
                                    li: ({node, ...props}) => <li className="mb-1" {...props} />,
                                    p: ({node, ...props}) => <p className="mb-2" {...props} />,
                                    code: ({node, ...props}) => <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs font-mono" {...props} />,
                                    pre: ({node, ...props}) => <pre className="bg-slate-100 dark:bg-slate-800 p-2 rounded mb-2 overflow-x-auto" {...props} />,
                                }}
                            >
                                {brainAnswer}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm italic py-4">
                            <Brain className="h-8 w-8 mb-2 opacity-20" />
                            <p>Ask a question or upload a file to get started.</p>
                        </div>
                    )}
                </div>
            </div>
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
                      {sampleSize !== null && sampleSize !== undefined ? sampleSize.toLocaleString() : "--"}
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
