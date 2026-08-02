"use client"

import { useId, useState } from "react"
import { ArrowRight, Check, ListChecks } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { AgentField, AgentFormBlock, AgentFormSubmission } from "@/lib/agent-api"
import { cn } from "@/lib/utils"

type FormValue = string | string[]

function humanFacingBlock(block: AgentFormBlock): AgentFormBlock {
  if (!block.fields.some((field) => field.id === "guardrails")) return block
  const sourceCopy = [block.title, block.description, ...block.fields.flatMap((field) => [field.label, field.placeholder, field.helper_text])]
    .filter(Boolean)
    .join(" ")
  const chinese = /[\u3400-\u9fff]/u.test(sourceCopy)
  const copy = chinese
    ? {
        title: "护栏指标",
        description: "直接描述哪些指标不能恶化，以及最多可接受多大变化。Agent 会将描述转换为结构化规则。",
        label: "需要监控哪些护栏指标？",
        placeholder: "例如：支付转化率不能下降超过 1 个百分点；崩溃率不能上升超过 0.2 个百分点。若无需护栏，输入“无”。",
        helper: "可以一次描述多个指标，无需使用特殊格式。",
      }
    : {
        title: "Guardrail outcomes",
        description: "Describe which outcomes must not worsen and by how much. The Agent will convert your answer into structured rules.",
        label: "Which guardrail outcomes should be monitored?",
        placeholder: "For example: conversion rate must not fall by more than 1 percentage point; crash rate must not rise by more than 0.2 percentage points. Enter “none” if no guardrails are needed.",
        helper: "You can describe several outcomes at once. No special format is required.",
      }
  return {
    ...block,
    title: block.fields.length === 1 ? copy.title : block.title,
    description: copy.description,
    fields: block.fields.map((field) => field.id === "guardrails"
      ? {
          ...field,
          label: copy.label,
          control: "textarea",
          placeholder: copy.placeholder,
          helper_text: copy.helper,
          options: [],
        }
      : field),
  }
}

function initialValues(block: AgentFormBlock): Record<string, FormValue> {
  return Object.fromEntries(
    block.fields.map((field) => [field.id, field.control === "checkbox_group" ? [] : ""]),
  )
}

function hasValue(field: AgentField, value: FormValue | undefined) {
  if (!field.required) return true
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value?.trim())
}

function visibleValue(field: AgentField, value: FormValue | undefined) {
  const rawValues = Array.isArray(value) ? value : [value ?? ""]
  return rawValues
    .filter(Boolean)
    .map((item) => {
      const label = field.options.find((option) => option.value === item)?.label
      return label && label !== item ? `${label} [${item}]` : item
    })
    .join(", ")
}

export function AgentFormCard({
  block,
  active,
  busy,
  onSubmit,
}: {
  block: AgentFormBlock
  active: boolean
  busy: boolean
  onSubmit: (submission: AgentFormSubmission) => void
}) {
  const idPrefix = useId()
  const visibleBlock = humanFacingBlock(block)
  const [values, setValues] = useState<Record<string, FormValue>>(() => initialValues(block))
  const complete = visibleBlock.fields.every((field) => hasValue(field, values[field.id]))
  const disabled = !active || busy

  const update = (field: AgentField, value: FormValue) => {
    setValues((current) => ({ ...current, [field.id]: value }))
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!complete || disabled) return
    const lines = visibleBlock.fields.map((field) => `${field.label}: ${visibleValue(field, values[field.id])}`)
    onSubmit({
      summary: `Form response\n${lines.join("\n")}`,
      values: Object.fromEntries(visibleBlock.fields.map((field) => [field.id, values[field.id]])),
    })
  }

  const submitWithShortcut = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey) || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.requestSubmit()
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={submitWithShortcut}
      aria-keyshortcuts="Meta+Enter Control+Enter"
      className={cn(
        "mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_50px_-38px_rgba(15,23,42,0.7)]",
        !active && "opacity-75",
      )}
    >
      <div className="border-b border-border bg-muted/40 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2 text-xs font-bold">
          <ListChecks className="h-4 w-4 text-muted-foreground" /> {visibleBlock.title}
        </div>
        {visibleBlock.description && <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{visibleBlock.description}</p>}
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {visibleBlock.fields.map((field) => {
          const fieldId = `${idPrefix}-${block.id}-${field.id}`
          const value = values[field.id]
          return (
            <fieldset key={field.id} disabled={disabled} className="relative space-y-2.5">
              <Label htmlFor={fieldId} className="leading-5">
                {field.label}{field.required && <span className="text-rose-500">*</span>}
              </Label>

              {field.control === "textarea" && (
                <Textarea
                  id={fieldId}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => update(field, event.target.value)}
                  placeholder={field.placeholder ?? undefined}
                  rows={3}
                  className="min-h-24"
                />
              )}

              {(field.control === "text" || field.control === "number" || field.control === "date") && (
                <Input
                  id={fieldId}
                  type={field.control}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => update(field, event.target.value)}
                  placeholder={field.placeholder ?? undefined}
                  min={field.min ?? undefined}
                  max={field.max ?? undefined}
                  step={field.step ?? undefined}
                />
              )}

              {field.control === "radio" && (
                <RadioGroup
                  value={typeof value === "string" ? value : ""}
                  onValueChange={(next) => update(field, next)}
                  className="gap-2"
                >
                  {field.options.map((option) => {
                    const optionId = `${fieldId}-${option.value}`
                    return (
                      <label key={option.value} htmlFor={optionId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/70 p-3 transition hover:bg-muted/55">
                        <RadioGroupItem id={optionId} value={option.value} className="mt-0.5" />
                        <span>
                          <span className="block text-sm font-semibold">{option.label}</span>
                          {option.description && <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{option.description}</span>}
                        </span>
                      </label>
                    )
                  })}
                </RadioGroup>
              )}

              {field.control === "checkbox_group" && (
                <div className="grid gap-2">
                  {field.options.map((option) => {
                    const selected = Array.isArray(value) && value.includes(option.value)
                    const optionId = `${fieldId}-${option.value}`
                    return (
                      <label key={option.value} htmlFor={optionId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/70 p-3 transition hover:bg-muted/55">
                        <Checkbox
                          id={optionId}
                          checked={selected}
                          onCheckedChange={(checked) => {
                            const current = Array.isArray(value) ? value : []
                            update(field, checked === true
                              ? [...current, option.value]
                              : current.filter((item) => item !== option.value))
                          }}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block text-sm font-semibold">{option.label}</span>
                          {option.description && <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{option.description}</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}

              {field.control === "select" && (
                <Select value={typeof value === "string" ? value : ""} onValueChange={(next) => update(field, next)} disabled={disabled}>
                  <SelectTrigger id={fieldId} className="w-full">
                    <SelectValue placeholder={field.placeholder ?? "Choose an option"} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              {field.helper_text && <p className="text-[11px] leading-5 text-muted-foreground">{field.helper_text}</p>}
            </fieldset>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/25 px-4 py-3 sm:px-5">
        <span className="text-[10px] text-muted-foreground">文本框可换行 · ⌘/Ctrl + Enter 继续</span>
        <Button type="submit" size="sm" disabled={!complete || disabled} className="rounded-lg">
          {!active ? <><Check className="h-4 w-4" /> Answered</> : <>{visibleBlock.submit_label}<ArrowRight className="h-4 w-4" /></>}
        </Button>
      </div>
    </form>
  )
}
