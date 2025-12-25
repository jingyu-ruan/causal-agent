"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { useMutation } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, AlertTriangle, Upload, BarChart2 } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ErrorBar } from 'recharts'

const API_BASE = "http://localhost:8000/api"

export default function AnalysisPage() {
    const [file, setFile] = useState<File | null>(null)
    const [demoMode, setDemoMode] = useState(false)
    
    const { register, handleSubmit, watch, setValue } = useForm({
        defaultValues: {
            metric_col: "",
            variant_col: "",
            metric_type: "binary",
            control_label: "",
            covariate_col: "",
            analysis_type: "frequentist"
        }
    })
    
    const mutation = useMutation({
        mutationFn: async (data: any) => {
            if (demoMode) {
                // Return mock data
                await new Promise(resolve => setTimeout(resolve, 800))
                return {
                    control_variant: "Control",
                    results: [
                        { variant: "Control", sample_size: 15000, mean: 0.124, std_dev: 0.33, lift: null, p_value: null, ci_lower: null, ci_upper: null, prob_beat_control: null },
                        { variant: "Treatment", sample_size: 14800, mean: 0.138, std_dev: 0.34, lift: 0.1129, p_value: 0.0004, ci_lower: 0.008, ci_upper: 0.020, prob_beat_control: 0.9998 }
                    ],
                    srm_warning: false,
                    warnings: []
                }
            }

            const formData = new FormData()
            if (!file) throw new Error("No file selected")
            formData.append("file", file)
            formData.append("metric_col", data.metric_col)
            formData.append("variant_col", data.variant_col)
            formData.append("metric_type", data.metric_type)
            formData.append("control_label", data.control_label)
            if (data.covariate_col) formData.append("covariate_col", data.covariate_col)
            formData.append("analysis_type", data.analysis_type)
            
            const res = await fetch(`${API_BASE}/analysis/upload`, {
                method: "POST",
                body: formData
            })
            
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || "Analysis failed")
            }
            return res.json()
        }
    })
    
    const onSubmit = (data: any) => {
        setDemoMode(false)
        mutation.mutate(data)
    }

    const loadDemoData = () => {
        setDemoMode(true)
        setValue("metric_col", "conversion")
        setValue("variant_col", "group")
        setValue("control_label", "Control")
        mutation.mutate({})
    }


    // Chart Data Preparation
    const controlVariant = mutation.data?.control_variant
    const controlResult = mutation.data?.results.find((r: any) => r.variant === controlVariant)
    const controlMean = controlResult?.mean || 1

    const chartData = mutation.data?.results
        .filter((r: any) => r.variant !== controlVariant)
        .map((res: any) => {
            // Calculate relative error for Lift chart
            // CI from backend is absolute difference CI
            // We want relative CI for Lift
            let error = 0
            if (res.ci_upper !== null && res.ci_lower !== null) {
                const absError = (res.ci_upper - res.ci_lower) / 2
                error = absError / Math.abs(controlMean)
            }

            return {
                name: res.variant,
                lift: res.lift,
                error: error
            }
        }) || []

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Data Analysis</h1>
                <p className="text-slate-500 dark:text-slate-400">Upload experiment data for instant analysis.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle>Configuration</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Data File (CSV)</Label>
                                <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Variant Column</Label>
                                <Input placeholder="e.g. group" {...register("variant_col", { required: true })} />
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Metric Column</Label>
                                <Input placeholder="e.g. converted" {...register("metric_col", { required: true })} />
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Metric Type</Label>
                                <Select onValueChange={v => setValue("metric_type", v)} defaultValue="binary">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="binary">Binary</SelectItem>
                                        <SelectItem value="continuous">Continuous</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Control Group Label</Label>
                                <Input placeholder="e.g. control" {...register("control_label", { required: true })} />
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Covariate (Optional, for CUPED)</Label>
                                <Input placeholder="e.g. pre_experiment_activity" {...register("covariate_col")} />
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Analysis</Label>
                                <RadioGroup defaultValue="frequentist" onValueChange={v => setValue("analysis_type", v)}>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="frequentist" id="freq" />
                                        <Label htmlFor="freq">Frequentist</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="bayesian" id="bayes" />
                                        <Label htmlFor="bayes">Bayesian</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                            
                            <Button type="submit" className="w-full" disabled={mutation.isPending || (!file && !demoMode)}>
                                {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart2 className="mr-2 h-4 w-4" />}
                                Analyze
                            </Button>
                            
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white px-2 text-slate-500">Or</span>
                                </div>
                            </div>
                            
                            <Button type="button" variant="outline" className="w-full" onClick={loadDemoData}>
                                Load Demo Data
                            </Button>
                        </form>
                    </CardContent>
                </Card>
                
                <div className="md:col-span-2 space-y-6">
                    {mutation.isError && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{mutation.error.message}</AlertDescription>
                        </Alert>
                    )}
                    
                    {mutation.isSuccess && mutation.data && (
                        <>
                            {mutation.data.srm_warning && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>SRM Detected</AlertTitle>
                                    <AlertDescription>
                                        Significant sample ratio mismatch detected. Check your randomization.
                                    </AlertDescription>
                                </Alert>
                            )}
                            
                            {mutation.data.warnings.map((w: string, i: number) => (
                                <Alert key={i} className="bg-yellow-50 text-yellow-900 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-800">
                                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                                    <AlertTitle>Warning</AlertTitle>
                                    <AlertDescription>{w}</AlertDescription>
                                </Alert>
                            ))}
                            
                            <Card>
                                <CardHeader>
                                    <CardTitle>Results</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="rounded-md border overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-100 dark:bg-slate-800 font-medium">
                                                <tr>
                                                    <th className="p-3">Variant</th>
                                                    <th className="p-3">Sample Size</th>
                                                    <th className="p-3">Mean</th>
                                                    <th className="p-3">Lift</th>
                                                    <th className="p-3">Stat. Sig</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {mutation.data.results.map((res: any) => (
                                                    <tr key={res.variant} className="border-t dark:border-slate-800">
                                                        <td className="p-3 font-medium">{res.variant}</td>
                                                        <td className="p-3">{res.sample_size.toLocaleString()}</td>
                                                        <td className="p-3">{res.mean.toFixed(4)}</td>
                                                        <td className={`p-3 ${res.lift > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {res.lift !== null ? `${(res.lift * 100).toFixed(2)}%` : '-'}
                                                        </td>
                                                        <td className="p-3">
                                                            {res.variant === mutation.data.control_variant ? '-' : (
                                                                mutation.data.results[0].prob_beat_control !== null ? 
                                                                    `Prob B>A: ${(res.prob_beat_control * 100).toFixed(1)}%` :
                                                                    `p=${res.p_value?.toFixed(4)}`
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                            
                            {chartData.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Lift Analysis (vs Control)</CardTitle>
                                        <CardDescription>Error bars represent 95% Confidence Interval.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="h-[300px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" />
                                                <YAxis tickFormatter={(val) => `${(val * 100).toFixed(1)}%`} />
                                                <Tooltip formatter={(val: number) => `${(val * 100).toFixed(2)}%`} />
                                                <Bar dataKey="lift" fill="#4f46e5" name="Lift">
                                                    <ErrorBar dataKey="error" width={4} strokeWidth={2} stroke="#3730a3" />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}
                    
                    {!mutation.data && !mutation.isPending && (
                        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-slate-400 dark:border-slate-700">
                            <div className="text-center">
                                <Upload className="mx-auto h-8 w-8 mb-2" />
                                <p>Upload a CSV file to begin analysis</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
