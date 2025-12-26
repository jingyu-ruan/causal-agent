"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { BarChart2, Upload, Loader2, AlertCircle, CheckCircle2, FileSpreadsheet, Dices } from "lucide-react"

interface CausalResult {
  effect: number
  ci_lower?: number
  ci_upper?: number
  p_value?: number
  method: string
  details: any
}

export default function ObservationalPage() {
  const [method, setMethod] = useState<string>("did")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CausalResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // File Preview State
  const [columns, setColumns] = useState<string[]>([])
  const [previewData, setPreviewData] = useState<any[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  // Form Fields
  const [unitCol, setUnitCol] = useState("unit")
  const [timeCol, setTimeCol] = useState("time")
  const [outcomeCol, setOutcomeCol] = useState("y")
  const [treatmentCol, setTreatmentCol] = useState("treat") // DiD
  const [postPeriodStart, setPostPeriodStart] = useState("2023") // DiD
  const [treatedUnit, setTreatedUnit] = useState("u1") // SCM
  const [interventionTime, setInterventionTime] = useState("2023") // SCM

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
    
    if (selectedFile) {
        setPreviewLoading(true)
        const formData = new FormData()
        formData.append("file", selectedFile)
        
        try {
            const res = await fetch("http://localhost:8000/common/preview", {
                method: "POST",
                body: formData
            })
            if (res.ok) {
                const data = await res.json()
                setColumns(data.columns)
                setPreviewData(data.preview)
                // Auto-select if matches defaults
                if (data.columns.includes("unit")) setUnitCol("unit")
                if (data.columns.includes("time")) setTimeCol("time")
                if (data.columns.includes("y")) setOutcomeCol("y")
                if (data.columns.includes("treat")) setTreatmentCol("treat")
            }
        } catch (error) {
            console.error("Preview failed", error)
        } finally {
            setPreviewLoading(false)
        }
    } else {
        setColumns([])
        setPreviewData([])
    }
  }

  const handleGenerateData = () => {
      window.location.href = "http://localhost:8000/common/generate_data?type=observational"
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError("Please upload a CSV or Excel file.")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append("file", file)
    formData.append("method", method)
    formData.append("unit_col", unitCol)
    formData.append("time_col", timeCol)
    formData.append("outcome_col", outcomeCol)

    if (method === "did") {
      formData.append("treatment_col", treatmentCol)
      formData.append("post_period_start", postPeriodStart)
    } else {
      formData.append("treated_unit", treatedUnit)
      formData.append("intervention_time", interventionTime)
    }

    try {
      const res = await fetch("http://localhost:8000/causal/analyze", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || "Analysis failed")
      }

      const data = await res.json()
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 p-6">
      <div className="space-y-2 flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <BarChart2 className="h-8 w-8 text-emerald-600" />
            Causal Inference Studio
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
            Estimate causal effects from observational data using DiD or Synthetic Controls.
            </p>
        </div>
        <Button variant="outline" onClick={handleGenerateData}>
            <Dices className="mr-2 h-4 w-4" />
            Generate Random Data
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Configuration Panel */}
        <div className="lg:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Setup your analysis parameters</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="did">Difference-in-Differences</SelectItem>
                      <SelectItem value="scm">Synthetic Control Method</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Data File (CSV/Excel)</Label>
                  <Input 
                    type="file" 
                    accept=".csv, .xlsx"
                    onChange={handleFileChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Unit Column</Label>
                  {columns.length > 0 ? (
                      <Select value={unitCol} onValueChange={setUnitCol}>
                          <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                          <SelectContent>
                              {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                      </Select>
                  ) : (
                      <Input value={unitCol} onChange={(e) => setUnitCol(e.target.value)} placeholder="e.g. city_id" />
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label>Time Column</Label>
                   {columns.length > 0 ? (
                      <Select value={timeCol} onValueChange={setTimeCol}>
                          <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                          <SelectContent>
                              {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                      </Select>
                  ) : (
                      <Input value={timeCol} onChange={(e) => setTimeCol(e.target.value)} placeholder="e.g. date_int" />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Outcome Column</Label>
                   {columns.length > 0 ? (
                      <Select value={outcomeCol} onValueChange={setOutcomeCol}>
                          <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                          <SelectContent>
                              {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                      </Select>
                  ) : (
                      <Input value={outcomeCol} onChange={(e) => setOutcomeCol(e.target.value)} placeholder="e.g. revenue" />
                  )}
                </div>

                {method === "did" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Treatment Column (Binary)</Label>
                       {columns.length > 0 ? (
                          <Select value={treatmentCol} onValueChange={setTreatmentCol}>
                              <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                              <SelectContent>
                                  {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                              </SelectContent>
                          </Select>
                      ) : (
                          <Input value={treatmentCol} onChange={(e) => setTreatmentCol(e.target.value)} placeholder="e.g. is_treated" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Post Period Start (Time)</Label>
                      <Input value={postPeriodStart} onChange={(e) => setPostPeriodStart(e.target.value)} placeholder="e.g. 20240101" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Treated Unit ID</Label>
                      <Input value={treatedUnit} onChange={(e) => setTreatedUnit(e.target.value)} placeholder="e.g. New York" />
                    </div>
                    <div className="space-y-2">
                      <Label>Intervention Time</Label>
                      <Input value={interventionTime} onChange={(e) => setInterventionTime(e.target.value)} placeholder="e.g. 20240101" />
                    </div>
                  </>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Run Analysis"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Results & Preview Panel */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Preview Card */}
          {previewData.length > 0 && (
             <Card>
                 <CardHeader>
                     <CardTitle className="flex items-center gap-2 text-sm">
                         <FileSpreadsheet className="h-4 w-4" />
                         Data Preview
                     </CardTitle>
                 </CardHeader>
                 <CardContent>
                     <div className="overflow-x-auto">
                         <table className="w-full text-xs text-left">
                             <thead className="bg-slate-100 dark:bg-slate-800 font-medium">
                                 <tr>
                                     {columns.map(c => <th key={c} className="p-2 border-b">{c}</th>)}
                                 </tr>
                             </thead>
                             <tbody>
                                 {previewData.map((row, i) => (
                                     <tr key={i} className="border-b">
                                         {columns.map(c => <td key={c} className="p-2">{String(row[c])}</td>)}
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                 </CardContent>
             </Card>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result ? (
            <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                  Analysis Complete
                </CardTitle>
                <CardDescription>
                  Method: <span className="font-semibold">{result.method}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-emerald-100 dark:border-emerald-900">
                    <p className="text-sm text-slate-500 mb-1">Estimated Effect (ATT)</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                      {result.effect.toFixed(4)}
                    </p>
                  </div>
                  {result.p_value !== null && result.p_value !== undefined && (
                     <div className="p-4 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-emerald-100 dark:border-emerald-900">
                      <p className="text-sm text-slate-500 mb-1">P-Value</p>
                      <p className={`text-3xl font-bold ${result.p_value < 0.05 ? 'text-emerald-600' : 'text-slate-600'}`}>
                        {result.p_value.toFixed(4)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Model Details</h4>
                  <div className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-auto max-h-[300px] text-xs font-mono">
                    <pre>{JSON.stringify(result.details, null, 2)}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            !loading && !previewData.length && (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-12">
                <BarChart2 className="h-16 w-16 mb-4 opacity-20" />
                <p>Upload data and configure parameters to see results here.</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
