"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useQuery, useMutation } from "@tanstack/react-query"
import { 
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage 
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ReactMarkdown from 'react-markdown'
import { Loader2, Check, ChevronRight, ChevronLeft, Download } from "lucide-react"
import { getApiHeaders } from "@/lib/settings"

const formSchema = z.object({
  goal: z.string().min(1, "Experiment Name is required"),
  hypothesis: z.string().optional(),
  primary_metric: z.string().min(1, "Primary Metric is required"),
  baseline_rate: z.coerce.number().min(0).max(1),
  mde_abs: z.coerce.number().min(0.0001).max(1),
  target_power: z.coerce.number().min(0.1).max(0.99),
  traffic_per_day: z.coerce.number().min(0),
  allocation_50_50: z.boolean().default(true),
  guardrails: z.array(z.string()).default([]),
  randomization_unit: z.string().default("user"),
  metric_type: z.enum(["binary", "continuous"]).default("binary"),
  std_dev: z.coerce.number().default(1.0),
  cuped_enabled: z.boolean().default(false),
  cuped_correlation: z.coerce.number().default(0.5),
  analysis_type: z.enum(["frequentist", "bayesian"]).default("frequentist"),
})

const PREDEFINED_GUARDRAILS = [
  "Latency (p95)",
  "Error Rate",
  "Revenue / GMV",
  "Unsubscribe Rate",
  "Customer Support Tickets"
]

const API_BASE = "http://localhost:8000/api"

export function ExperimentWizard() {
  const [step, setStep] = useState(1)
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      goal: "",
      hypothesis: "",
      primary_metric: "",
      metric_type: "binary",
      baseline_rate: 0.1,
      std_dev: 1.0,
      mde_abs: 0.01,
      target_power: 0.8,
      traffic_per_day: 1000,
      allocation_50_50: true,
      guardrails: [],
      randomization_unit: "user",
      cuped_enabled: false,
      cuped_correlation: 0.5,
      analysis_type: "frequentist",
    }
  })

  const watchAll = form.watch()
  
  // Power Calculation Query
  const powerQuery = useQuery({
    queryKey: ['power', watchAll.baseline_rate, watchAll.mde_abs, watchAll.target_power, watchAll.metric_type, watchAll.std_dev, watchAll.cuped_enabled, watchAll.cuped_correlation],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/design/power`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            ...getApiHeaders()
        },
        body: JSON.stringify({
          baseline_rate: watchAll.baseline_rate,
          mde_abs: watchAll.mde_abs,
          power: watchAll.target_power,
          alpha: 0.05,
          two_sided: true,
          metric_type: watchAll.metric_type,
          std_dev: watchAll.metric_type === 'continuous' ? watchAll.std_dev : undefined,
          cuped_enabled: watchAll.cuped_enabled,
          cuped_correlation: watchAll.cuped_enabled ? watchAll.cuped_correlation : undefined
        })
      })
      if (!res.ok) throw new Error("Failed to fetch power")
      return res.json()
    },
    enabled: step === 2
  })

  // Power Curve
  const [curveData, setCurveData] = useState<any[]>([])

  useEffect(() => {
    if (step === 2) {
        const center = watchAll.mde_abs
        const points = [0.5, 0.75, 1.0, 1.25, 1.5].map(f => center * f).filter(v => v > 0)
        
        Promise.all(points.map(async (mde) => {
            const res = await fetch(`${API_BASE}/design/power`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    ...getApiHeaders()
                },
                body: JSON.stringify({
                  baseline_rate: watchAll.baseline_rate,
                  mde_abs: mde,
                  power: watchAll.target_power,
                  alpha: 0.05,
                  two_sided: true,
                  metric_type: watchAll.metric_type,
                  std_dev: watchAll.metric_type === 'continuous' ? watchAll.std_dev : undefined,
                  cuped_enabled: watchAll.cuped_enabled,
                  cuped_correlation: watchAll.cuped_enabled ? watchAll.cuped_correlation : undefined
                })
            })
            const data = await res.json()
            return { mde: mde, sampleSize: data.total_n }
        })).then(results => {
            setCurveData(results.sort((a, b) => a.mde - b.mde))
        })
    }
  }, [step, watchAll.baseline_rate, watchAll.mde_abs, watchAll.target_power, watchAll.metric_type, watchAll.std_dev, watchAll.cuped_enabled, watchAll.cuped_correlation])


  // Plan Generation Mutation
  const planMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
        const res = await fetch(`${API_BASE}/design/plan`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                ...getApiHeaders()
            },
            body: JSON.stringify({
                goal: values.goal,
                baseline_rate: values.baseline_rate,
                mde_abs: values.mde_abs,
                alpha: 0.05,
                target_power: values.target_power,
                traffic_per_day: values.traffic_per_day,
                allocation_treatment: values.allocation_50_50 ? 0.5 : 0.5,
                allocation_control: values.allocation_50_50 ? 0.5 : 0.5,
                randomization_unit: values.randomization_unit,
                primary_metric: values.primary_metric,
                metric_type: values.metric_type,
                metric_window_days: 7,
                guardrails: values.guardrails,
                segments: [],
                notes: values.hypothesis || "",
                std_dev: values.metric_type === 'continuous' ? values.std_dev : undefined,
                cuped_enabled: values.cuped_enabled,
                cuped_correlation: values.cuped_enabled ? values.cuped_correlation : undefined,
                analysis_type: values.analysis_type
            })
        })
        if (!res.ok) throw new Error("Failed to generate plan")
        return res.json()
    }
  })

  const nextStep = async () => {
    const isValid = await form.trigger()
    if (isValid) setStep(s => Math.min(s + 1, 4))
  }

  const prevStep = () => setStep(s => Math.max(s - 1, 1))

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    planMutation.mutate(data)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">New Experiment</h1>
        <p className="text-slate-500">Design a rigorous A/B test in minutes.</p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm font-medium text-slate-500">
            <span>Context</span>
            <span>Power Analysis</span>
            <span>Configuration</span>
            <span>Review</span>
        </div>
        <Progress value={step * 25} className="h-2" />
      </div>

      <Card>
        <CardContent className="p-6">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    
                    {step === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                            <FormField control={form.control} name="goal" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Experiment Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. New Checkout Flow" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="hypothesis" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Hypothesis</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="If we change X, then Y will happen because Z..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="primary_metric" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Primary Metric</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Conversion Rate" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            <FormField control={form.control} name="metric_type" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Metric Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a metric type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="binary">Binary (Conversion Rate, 0/1)</SelectItem>
                                            <SelectItem value="continuous">Continuous (Revenue, Time spent)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <FormField control={form.control} name="baseline_rate" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Baseline Conversion Rate: {field.value}</FormLabel>
                                            <FormControl>
                                                <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    
                                    <FormField control={form.control} name="mde_abs" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Minimum Detectable Effect (MDE): {field.value}</FormLabel>
                                            <FormControl>
                                                <Slider min={0.001} max={0.2} step={0.001} value={[field.value]} onValueChange={vals => field.onChange(vals[0])} />
                                            </FormControl>
                                            <FormDescription>Absolute change (e.g. 0.01 = 1%)</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )} />

                                    <FormField control={form.control} name="target_power" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Desired Power: {field.value}</FormLabel>
                                            <FormControl>
                                                <Slider min={0.5} max={0.99} step={0.01} value={[field.value]} onValueChange={vals => field.onChange(vals[0])} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />

                                    <FormField control={form.control} name="traffic_per_day" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Daily Traffic</FormLabel>
                                            <FormControl>
                                                <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                </div>

                                <div className="space-y-4">
                                    <div className="rounded-lg border bg-slate-50 p-4">
                                        <h3 className="font-semibold text-slate-900">Analysis</h3>
                                        <div className="mt-2 text-3xl font-bold text-indigo-600">
                                            {powerQuery.data?.total_n.toLocaleString() || "..."}
                                        </div>
                                        <p className="text-sm text-slate-500">Total Sample Size Required</p>
                                        
                                        <div className="mt-4 text-xl font-semibold text-slate-700">
                                            {powerQuery.data && watchAll.traffic_per_day > 0 
                                                ? Math.ceil(powerQuery.data.total_n / watchAll.traffic_per_day) 
                                                : "..."} Days
                                        </div>
                                        <p className="text-sm text-slate-500">Estimated Duration</p>
                                    </div>

                                    <div className="h-48 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={curveData}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="mde" tickFormatter={(val: any) => val.toFixed(3)} />
                                                <YAxis hide />
                                                <Tooltip formatter={(val: any) => val.toLocaleString()} labelFormatter={(val: any) => `MDE: ${Number(val).toFixed(3)}`} />
                                                <Area type="monotone" dataKey="sampleSize" stroke="#4f46e5" fill="#e0e7ff" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                            <FormField control={form.control} name="analysis_type" render={({ field }) => (
                                <FormItem className="space-y-3">
                                    <FormLabel>Analysis Framework</FormLabel>
                                    <FormControl>
                                        <RadioGroup
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            className="flex flex-col space-y-1"
                                        >
                                            <FormItem className="flex items-center space-x-3 space-y-0">
                                                <FormControl>
                                                    <RadioGroupItem value="frequentist" />
                                                </FormControl>
                                                <FormLabel className="font-normal">
                                                    Frequentist (P-value, Confidence Intervals)
                                                </FormLabel>
                                            </FormItem>
                                            <FormItem className="flex items-center space-x-3 space-y-0">
                                                <FormControl>
                                                    <RadioGroupItem value="bayesian" />
                                                </FormControl>
                                                <FormLabel className="font-normal">
                                                    Bayesian (Probability B beats A)
                                                </FormLabel>
                                            </FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            <FormField control={form.control} name="allocation_50_50" render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">50/50 Traffic Split</FormLabel>
                                        <FormDescription>
                                            Allocate traffic evenly between Control and Treatment.
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                </FormItem>
                            )} />

                            <FormField control={form.control} name="guardrails" render={() => (
                                <FormItem>
                                    <div className="mb-4">
                                        <FormLabel className="text-base">Guardrails</FormLabel>
                                        <FormDescription>Select metrics to monitor for negative impact.</FormDescription>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {PREDEFINED_GUARDRAILS.map((item) => (
                                            <FormField
                                                key={item}
                                                control={form.control}
                                                name="guardrails"
                                                render={({ field }) => {
                                                    return (
                                                        <FormItem
                                                            key={item}
                                                            className="flex flex-row items-start space-x-3 space-y-0"
                                                        >
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={field.value?.includes(item)}
                                                                    onCheckedChange={(checked) => {
                                                                        return checked
                                                                            ? field.onChange([...field.value, item])
                                                                            : field.onChange(
                                                                                field.value?.filter(
                                                                                    (value) => value !== item
                                                                                )
                                                                            )
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormLabel className="font-normal">
                                                                {item}
                                                            </FormLabel>
                                                        </FormItem>
                                                    )
                                                }}
                                            />
                                        ))}
                                    </div>
                                </FormItem>
                            )} />
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                            <div className="rounded-md border bg-slate-50 p-4 space-y-2">
                                <h3 className="font-semibold">Summary</h3>
                                <p><strong>Name:</strong> {watchAll.goal}</p>
                                <p><strong>Metric:</strong> {watchAll.primary_metric}</p>
                                <p><strong>MDE:</strong> {watchAll.mde_abs}</p>
                                <p><strong>Sample Size:</strong> {powerQuery.data?.total_n.toLocaleString()}</p>
                            </div>

                            {planMutation.isPending && (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                                    <span className="ml-2 text-slate-500">Generating Plan...</span>
                                </div>
                            )}

                            {planMutation.isError && (
                                <div className="text-red-500">Error generating plan.</div>
                            )}

                            {planMutation.isSuccess && planMutation.data && (
                                <div className="mt-4 prose prose-slate max-w-none">
                                    <div className="rounded-lg border p-6 bg-white shadow-sm">
                                        <div className="flex justify-between items-center mb-4">
                                            <h2 className="text-2xl font-bold">{planMutation.data.title}</h2>
                                            <Button variant="outline" size="sm" onClick={() => window.print()}>
                                                <Download className="mr-2 h-4 w-4" /> Export PDF
                                            </Button>
                                        </div>
                                        <div className="mb-4 p-4 bg-blue-50 rounded-md">
                                            <strong>Hypothesis:</strong> {planMutation.data.hypothesis}
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4 mb-6">
                                            <Card>
                                                <CardContent className="pt-6">
                                                    <div className="text-2xl font-bold">{planMutation.data.sample_size.toLocaleString()}</div>
                                                    <div className="text-sm text-gray-500">Total Sample Size</div>
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardContent className="pt-6">
                                                    <div className="text-2xl font-bold">{planMutation.data.estimated_duration_days} Days</div>
                                                    <div className="text-sm text-gray-500">Estimated Duration</div>
                                                </CardContent>
                                            </Card>
                                        </div>

                                        <h3 className="text-lg font-semibold mt-6 mb-2">Analysis Plan</h3>
                                        <ul className="list-disc pl-5 space-y-1">
                                            {planMutation.data.analysis_outline.map((item: string, i: number) => (
                                                <li key={i}>{item}</li>
                                            ))}
                                        </ul>

                                        <h3 className="text-lg font-semibold mt-6 mb-2">Risks</h3>
                                        <ul className="list-disc pl-5 space-y-1 text-amber-700">
                                            {planMutation.data.risks.map((item: string, i: number) => (
                                                <li key={i}>{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-between pt-4 border-t">
                        <Button type="button" variant="outline" onClick={prevStep} disabled={step === 1}>
                            <ChevronLeft className="mr-2 h-4 w-4" /> Back
                        </Button>
                        
                        {step < 4 ? (
                            <Button type="button" onClick={nextStep}>
                                Next <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            !planMutation.isSuccess && (
                                <Button type="submit" disabled={planMutation.isPending}>
                                    Generate Plan
                                </Button>
                            )
                        )}
                    </div>
                </form>
            </Form>
        </CardContent>
      </Card>
    </div>
  )
}
