"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Construction } from "lucide-react"

export default function ObservationalPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Causal Inference</h1>
        <p className="text-slate-500 dark:text-slate-400">Analyze historical data when randomization isn't possible.</p>
      </div>

      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
          <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800">
            <Construction className="h-12 w-12 text-slate-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Under Construction</h3>
            <p className="text-slate-500 max-w-md mx-auto">
              We're building powerful tools for Propensity Score Matching, DiD, and Instrumental Variables. 
              Check back soon!
            </p>
          </div>
          <div className="pt-4">
            <Button disabled>Start Analysis (Coming Soon)</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
