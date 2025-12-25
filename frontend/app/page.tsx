"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Beaker, BarChart2, ArrowRight } from "lucide-react"
import Link from "next/link"

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 p-8">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-6xl">
          Causal Agent
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          The all-in-one platform for rigorous experimentation and causal inference.
          Choose your path to truth.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl w-full">
        <Link href="/abtest/new" className="group">
          <Card className="h-full transition-all duration-300 hover:shadow-xl hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500 dark:hover:border-indigo-400 cursor-pointer">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-3 rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                  <Beaker className="h-8 w-8" />
                </div>
                <ArrowRight className="h-6 w-6 text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
              </div>
              <CardTitle className="mt-4 text-2xl">Experimentation (A/B)</CardTitle>
              <CardDescription className="text-base">
                Design and analyze randomized controlled trials.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-slate-600 dark:text-slate-400">
                <li className="flex items-center">
                  <span className="mr-2 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  Power Analysis & Sample Size
                </li>
                <li className="flex items-center">
                  <span className="mr-2 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  Frequentist & Bayesian Methods
                </li>
                <li className="flex items-center">
                  <span className="mr-2 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  SRM Detection & Guardrails
                </li>
              </ul>
            </CardContent>
          </Card>
        </Link>

        <Link href="/observational/new" className="group">
          <Card className="h-full transition-all duration-300 hover:shadow-xl hover:border-emerald-500 hover:ring-1 hover:ring-emerald-500 dark:hover:border-emerald-400 cursor-pointer">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="p-3 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <BarChart2 className="h-8 w-8" />
                </div>
                <ArrowRight className="h-6 w-6 text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
              </div>
              <CardTitle className="mt-4 text-2xl">Causal Inference</CardTitle>
              <CardDescription className="text-base">
                Extract causal insights from observational data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-slate-600 dark:text-slate-400">
                <li className="flex items-center">
                  <span className="mr-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Propensity Score Matching
                </li>
                <li className="flex items-center">
                  <span className="mr-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Difference-in-Differences
                </li>
                <li className="flex items-center">
                  <span className="mr-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Synthetic Control Methods
                </li>
              </ul>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
