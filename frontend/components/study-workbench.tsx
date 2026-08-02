"use client"

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import {
  AlertCircle,
  ArrowRight,
  Braces,
  Check,
  CheckCircle2,
  Copy,
  Database,
  FileCheck2,
  FileSpreadsheet,
  KeyRound,
  MessageSquareText,
  Moon,
  PanelLeft,
  Paperclip,
  Pencil,
  RefreshCw,
  Send,
  Settings2,
  SquareTerminal,
  Sun,
  UploadCloud,
  Wrench,
  X,
} from "lucide-react"

import { AgentFormCard } from "@/components/agent-form-card"
import { AgentSettingsDialog } from "@/components/agent-settings"
import { useBackendReadiness } from "@/components/backend-readiness"
import { ConversationHistorySidebar } from "@/components/conversation-history-sidebar"
import { normalizeEvidence, type NormalizedEvidence } from "@/components/study-evidence"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  runIntakeAgent,
  toAgentDraft,
  type AgentDraft,
  type AgentDraftField,
  type AgentFormBlock,
  type AgentFormSubmission,
  type AgentHistoryMessage,
  type AgentTurnResponse,
} from "@/lib/agent-api"
import {
  useAgentSettings,
  type AgentSettings,
  type DeepSeekModel,
} from "@/lib/agent-settings"
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  updateConversation,
  type ConversationSummary,
} from "@/lib/conversation-api"
import {
  analyzeStudy,
  createStudyDesign,
  getStudy,
  getStudyId,
  type AgentTraceStep,
  type StudyDesignInput,
  type StudyRecord,
} from "@/lib/studies-api"
import { cloneTemplate, STUDY_TEMPLATES } from "@/lib/study-templates"
import { cn } from "@/lib/utils"

type ConversationStage =
  | "intake"
  | "review"
  | "freezing"
  | "data"
  | "mapping"
  | "lineage"
  | "analysis"
  | "complete"

type MessageKind = "text" | "review" | "design" | "result" | "attachment"

type ChatMessage = {
  id: string
  role: "agent" | "user" | "tool"
  text: string
  kind?: MessageKind
  attachmentName?: string
  blocks?: AgentFormBlock[]
  activityId?: string
  checkpoint?: ConversationCheckpoint
}

type ActivityKind = "api" | "python" | "tool" | "storage" | "file"
type ActivityStatus = "running" | "done" | "error"

type ActivityEvent = {
  id: string
  kind: ActivityKind
  label: string
  detail?: string
  status: ActivityStatus
}

const DESIGN_TRACE_STEPS = new Set([
  "validate_request",
  "create_causal_contract",
  "freeze_design_spec",
  "declare_expected_schema",
])

const TRACE_NARRATION: Record<string, string> = {
  validate_request: "The structured inputs passed validation. I’m creating the causal contract next.",
  create_causal_contract: "The estimand and metric policy are now explicit. Next I’m freezing the design specification.",
  freeze_design_spec: "The design specification is frozen. I’m declaring the expected evidence schema next.",
  declare_expected_schema: "The data contract is declared. The frozen design is ready for a dataset.",
  snapshot_dataset: "The uploaded dataset is hashed and tied to its recorded lineage. I’m running the evidence gates next.",
  run_frozen_evidence_gates: "The deterministic diagnostics are complete. I’m executing the estimator declared by the design.",
  deterministic_rct_estimator: "The randomized AB estimate is complete. I’m applying the frozen decision thresholds next.",
  two_way_fixed_effects_clustered_estimator: "The Difference-in-Differences estimate is complete. I’m applying the frozen decision thresholds next.",
  apply_frozen_thresholds: "The pre-committed primary and guardrail rules have been evaluated.",
}

type AgentTurnPayload = {
  messages: AgentHistoryMessage[]
  draft: AgentDraft
  captured_fields: AgentDraftField[]
  model: DeepSeekModel
  locale: string
}

type ColumnMapping = {
  unit_col: string
  treatment_col: string
  time_col: string
  metric_cols: Record<string, string>
  covariate_cols: Record<string, string>
}

type ConversationCheckpoint = {
  input: StudyDesignInput
  capturedFields: AgentDraftField[]
  stage: ConversationStage
  activeFormMessageId: string | null
  activitiesLength: number
  artifact: StudyRecord | null
  mapping: ColumnMapping
}

type ConversationSnapshot = Record<string, unknown> & {
  version: 1
  input: StudyDesignInput
  captured_fields: AgentDraftField[]
  stage: ConversationStage
  messages: ChatMessage[]
  active_form_message_id: string | null
  activities: ActivityEvent[]
  artifact: StudyRecord | null
  mapping: ColumnMapping
  custom_title?: string | null
}

const OPENING_MESSAGE_ID = "agent-opening"

function openingMessage(): ChatMessage {
  return {
    id: OPENING_MESSAGE_ID,
    role: "agent",
    text: "先从研究问题和可检验假设开始。这两项会成为后续因果设计的固定起点。",
    blocks: [{
      type: "form",
      id: "study-question-and-hypothesis",
      title: "研究问题与假设",
      description: "请同时描述要支持的业务决策，以及为什么预期干预会改变结果。",
      submit_label: "继续",
      fields: [
        {
          id: "business_question",
          label: "业务问题",
          control: "textarea",
          required: true,
          placeholder: "例如：新版首页是否提升了用户次日留存率？",
          helper_text: "清晰描述你希望评估的改变或决策。",
          options: [],
        },
        {
          id: "hypothesis",
          label: "研究假设",
          control: "textarea",
          required: true,
          placeholder: "例如：新版首页使次日留存率提高 2 个百分点。",
          helper_text: "写出预期的因果方向及其机制。",
          options: [],
        },
      ],
    }],
  }
}

export function StudyWorkbench() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { resolvedTheme, setTheme } = useTheme()
  const readiness = useBackendReadiness()
  const requestedConversationId = searchParams.get("conversation")
  const requestedTemplate = searchParams.get("template") ?? ""
  const requestedMode = searchParams.get("mode")
  const templateExists = STUDY_TEMPLATES.some((item) => item.id === requestedTemplate)
  const startingInput = useMemo(() => {
    const next = cloneTemplate(requestedTemplate)
    if (requestedMode === "retrospective" || requestedMode === "prospective") next.mode = requestedMode
    return next
  }, [requestedMode, requestedTemplate])

  const [input, setInput] = useState<StudyDesignInput>(() => startingInput)
  const [stage, setStage] = useState<ConversationStage>(() => templateExists ? "review" : "intake")
  const [messages, setMessages] = useState<ChatMessage[]>(() => requestedConversationId ? [] : initialMessages(requestedTemplate, templateExists))
  const [capturedFields, setCapturedFields] = useState<AgentDraftField[]>(() => initialCapturedFields(startingInput, templateExists, requestedMode))
  const [activeFormMessageId, setActiveFormMessageId] = useState<string | null>(() => requestedConversationId || templateExists ? null : OPENING_MESSAGE_ID)
  const agentSettings = useAgentSettings()
  const [settingsRequested, setSettingsRequested] = useState(false)
  const [settingsDismissed, setSettingsDismissed] = useState(false)
  const [draft, setDraft] = useState("")
  const [artifact, setArtifact] = useState<StudyRecord | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [columns, setColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>(() => defaultMapping(startingInput))
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryAgentRequest, setRetryAgentRequest] = useState<(() => void) | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationLoading, setConversationLoading] = useState(true)
  const [conversationHydrated, setConversationHydrated] = useState(false)
  const [conversationSidebarOpen, setConversationSidebarOpen] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [customConversationTitle, setCustomConversationTitle] = useState<string | null>(null)
  const messageCounter = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replyTimerRef = useRef<number | null>(null)
  const agentRequestCounter = useRef(0)
  const conversationSaveTimer = useRef<number | null>(null)
  const pendingEditedMessageRef = useRef<string | null>(null)

  const evidence = useMemo(() => artifact ? normalizeEvidence(artifact) : null, [artifact])
  const studyId = artifact ? getStudyId(artifact) : ""
  const quickReplies = repliesFor(stage, file)
  const agentApiConfigured = Boolean(agentSettings.apiKey.trim())
  const settingsOpen = settingsRequested || (!agentApiConfigured && !settingsDismissed && conversationHydrated && !conversationLoading)
  const activeConversationTitle = conversations.find((conversation) => conversation.id === conversationId)?.title
    ?? conversationTitle(input, messages)

  const makeSnapshot = (): ConversationSnapshot => ({
    version: 1,
    input,
    captured_fields: capturedFields,
    stage,
    messages,
    active_form_message_id: activeFormMessageId,
    activities,
    artifact,
    mapping,
    custom_title: customConversationTitle,
  })

  const restoreSnapshot = (snapshot: ConversationSnapshot) => {
    const restoredInput = snapshot.version === 1 && snapshot.input ? snapshot.input : startingInput
    const rawMessages = Array.isArray(snapshot.messages) && snapshot.messages.length > 0 ? snapshot.messages : [openingMessage()]
    const rawActivities = Array.isArray(snapshot.activities) ? snapshot.activities : []
    const restoredConversation = normalizeRestoredConversation(rawMessages, rawActivities)
    const restoredMessages = restoredConversation.messages
    const restoredActivities = restoredConversation.activities
    const restoredStage = snapshot.stage === "freezing"
      ? "review"
      : ["mapping", "lineage", "analysis"].includes(snapshot.stage)
        ? "data"
        : snapshot.stage ?? "intake"
    setInput(restoredInput)
    setStage(restoredStage)
    setMessages(restoredMessages)
    setCapturedFields(Array.isArray(snapshot.captured_fields) ? snapshot.captured_fields : [])
    setActiveFormMessageId(snapshot.active_form_message_id ?? (restoredMessages[0]?.id === OPENING_MESSAGE_ID ? OPENING_MESSAGE_ID : null))
    setActivities(restoredActivities.map((activity) => activity.status === "running" ? { ...activity, status: "error", detail: "Interrupted before this conversation was restored." } : activity))
    setArtifact(snapshot.artifact ?? null)
    setMapping(snapshot.mapping ?? defaultMapping(restoredInput))
    setCustomConversationTitle(snapshot.custom_title?.trim() || null)
    setFile(null)
    setColumns([])
    setDraft("")
    setBusy(false)
    setTyping(false)
    setError(null)
    setRetryAgentRequest(null)
    messageCounter.current = Math.max(restoredMessages.length, ...restoredMessages.map((message) => numericSuffix(message.id)))
    agentRequestCounter.current = Math.max(restoredActivities.length, ...restoredActivities.map((activity) => activitySequence(activity.id)))
  }

  const openAgentSettings = () => {
    setSettingsDismissed(false)
    setSettingsRequested(true)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [messages, typing, busy])

  useEffect(() => () => {
    if (replyTimerRef.current !== null) window.clearTimeout(replyTimerRef.current)
    if (conversationSaveTimer.current !== null) window.clearTimeout(conversationSaveTimer.current)
  }, [])

  useEffect(() => {
    if (readiness.state !== "ready") return
    if (requestedConversationId && requestedConversationId === conversationId && conversationHydrated) return
    let cancelled = false

    const initializeConversation = async () => {
      setConversationLoading(true)
      setHistoryError(null)
      try {
        const recent = await listConversations()
        if (cancelled) return
        setConversations(recent)

        if (requestedConversationId) {
          const persisted = await getConversation<ConversationSnapshot>(requestedConversationId)
          if (cancelled) return
          setConversationHydrated(false)
          restoreSnapshot(persisted.state)
          setConversationId(persisted.id)
          setConversations((current) => upsertConversationSummary(current, persisted))
        } else {
          const snapshot = makeSnapshot()
          const created = await createConversation({
            title: conversationTitle(snapshot.input, snapshot.messages),
            status: snapshot.stage,
            model: agentSettings.model,
            study_id: studyId || null,
            state: snapshot,
          })
          if (cancelled) return
          setConversationId(created.id)
          setConversations((current) => upsertConversationSummary(current, created))
          const params = new URLSearchParams(searchParams.toString())
          params.set("conversation", created.id)
          router.replace(`/studies/new?${params.toString()}`, { scroll: false })
        }
        setConversationHydrated(true)
      } catch (caught) {
        if (cancelled) return
        setHistoryError(errorMessage(caught))
      } finally {
        if (!cancelled) setConversationLoading(false)
      }
    }

    void initializeConversation()
    return () => { cancelled = true }
    // Conversation state is deliberately loaded only when its URL key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readiness.state, requestedConversationId])

  useEffect(() => {
    if (!conversationId || !conversationHydrated || conversationLoading) return
    if (conversationSaveTimer.current !== null) window.clearTimeout(conversationSaveTimer.current)
    const snapshot = makeSnapshot()
    conversationSaveTimer.current = window.setTimeout(() => {
      void updateConversation(conversationId, {
        title: snapshot.custom_title?.trim() || conversationTitle(snapshot.input, snapshot.messages),
        status: snapshot.stage,
        model: agentSettings.model,
        study_id: snapshot.artifact ? getStudyId(snapshot.artifact) || null : null,
        state: snapshot,
      }).then((saved) => {
        setConversations((current) => upsertConversationSummary(current, saved))
        setHistoryError(null)
      }).catch((caught) => setHistoryError(errorMessage(caught)))
    }, 450)
    return () => {
      if (conversationSaveTimer.current !== null) window.clearTimeout(conversationSaveTimer.current)
    }
    // Draft keystrokes are intentionally excluded; only submitted conversation state is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversationHydrated, conversationLoading, input, capturedFields, stage, messages, activeFormMessageId, activities, artifact, mapping, customConversationTitle, agentSettings.model])

  const nextMessageId = (role: "agent" | "user" | "tool") => {
    messageCounter.current += 1
    return `${role}-${messageCounter.current}`
  }

  const nextActivityId = (prefix: string) => {
    agentRequestCounter.current += 1
    return `${prefix}-${agentRequestCounter.current}`
  }

  const checkpoint = (overrides?: Partial<ConversationCheckpoint>): ConversationCheckpoint => ({
    input,
    capturedFields,
    stage,
    activeFormMessageId,
    activitiesLength: activities.length,
    artifact,
    mapping,
    ...overrides,
  })

  const appendUser = (text: string, attachmentName?: string, stateCheckpoint: ConversationCheckpoint = checkpoint()) => {
    const id = nextMessageId("user")
    setMessages((current) => [...current, {
      id,
      role: "user",
      text,
      kind: attachmentName ? "attachment" : "text",
      attachmentName,
      checkpoint: stateCheckpoint,
    }])
    return id
  }

  const appendTool = (activityId: string) => {
    const id = nextMessageId("tool")
    setMessages((current) => [...current, { id, role: "tool", text: "", activityId }])
    return id
  }

  const appendAgent = (text: string, kind: MessageKind = "text", blocks: AgentFormBlock[] = []) => {
    const id = nextMessageId("agent")
    setMessages((current) => [...current, { id, role: "agent", text, kind, blocks }])
    setActiveFormMessageId(blocks.length ? id : null)
    return id
  }

  const revealTraceActivities = async (trace: ActivityEvent[]) => {
    for (const activity of trace) {
      setActivities((current) => [...current, activity])
      appendTool(activity.id)
      await waitForWorkflowStep()
      const narration = TRACE_NARRATION[activity.label]
      if (narration) {
        appendAgent(narration)
        await waitForWorkflowStep(120)
      }
    }
  }

  const ask = (nextStage: ConversationStage, text: string, kind: MessageKind = "text") => {
    if (replyTimerRef.current !== null) window.clearTimeout(replyTimerRef.current)
    setBusy(true)
    setTyping(true)
    replyTimerRef.current = window.setTimeout(() => {
      appendAgent(text, kind)
      setStage(nextStage)
      setTyping(false)
      setBusy(false)
      replyTimerRef.current = null
    }, 280)
  }

  const requestAgentTurn = async (
    answer?: string,
    settings: AgentSettings = agentSettings,
    base?: { history: ChatMessage[]; draft: StudyDesignInput; captured: AgentDraftField[]; checkpoint?: ConversationCheckpoint },
    replay?: AgentTurnPayload,
  ) => {
    if (!settings.apiKey.trim()) {
      openAgentSettings()
      setError("Connect a DeepSeek API key before messaging the study Agent.")
      return
    }

    let payload: AgentTurnPayload
    if (replay) {
      payload = replay
    } else {
      const submittedAnswer = answer?.slice(0, 6000)
      const sourceMessages = base?.history ?? messages
      const history: AgentHistoryMessage[] = sourceMessages
        .filter((message) => message.role !== "tool" && message.kind !== "attachment" && message.text.trim())
        .map((message): AgentHistoryMessage => ({
          role: message.role === "agent" ? "assistant" : "user",
          content: message.text,
        }))
        .slice(-28)
      if (submittedAnswer) {
        appendUser(submittedAnswer, undefined, base?.checkpoint ?? checkpoint())
        history.push({ role: "user", content: submittedAnswer })
      }
      payload = {
        messages: history,
        draft: toAgentDraft(base?.draft ?? input),
        captured_fields: base?.captured ?? capturedFields,
        model: settings.model,
        locale: typeof navigator === "undefined" ? "en" : navigator.language.split("-").slice(0, 2).join("-"),
      }
    }

    const previousActiveFormMessageId = base?.checkpoint?.activeFormMessageId ?? activeFormMessageId
    const previousStage = base?.checkpoint?.stage ?? stage
    setDraft("")
    setError(null)
    setRetryAgentRequest(null)
    setBusy(true)
    setTyping(true)
    setActiveFormMessageId(null)
    const activityId = nextActivityId("agent")
    setActivities((current) => [...current, {
      id: activityId,
      kind: "api",
      label: `DeepSeek · ${settings.model}`,
      detail: "Analyze answer and plan the next question",
      status: "running",
    }])
    appendTool(activityId)

    try {
      let response: AgentTurnResponse
      try {
        response = await runIntakeAgent(payload, settings.apiKey)
      } catch (firstAttemptError) {
        if (!isFailedToFetchError(firstAttemptError)) throw firstAttemptError
        setActivities((current) => current.map((item) => item.id === activityId
          ? { ...item, detail: "Connection interrupted — retrying once…", status: "running" }
          : item))
        await waitForAgentRetry()
        response = await runIntakeAgent(payload, settings.apiKey)
      }
      setInput((current) => mergeAgentPatch(current, response.draft_patch))
      setCapturedFields(response.captured_fields)
      appendAgent(response.message, response.ready_to_freeze ? "review" : "text", response.blocks)
      setStage(response.ready_to_freeze ? "review" : "intake")
      setActivities((current) => current.map((item) => item.id === activityId
        ? { ...item, detail: response.ready_to_freeze ? "Contract ready for review" : `${response.missing_fields.length} fields still open`, status: "done" }
        : item))
    } catch (caught) {
      const message = errorMessage(caught)
      setError(message)
      setStage(previousStage)
      setActiveFormMessageId(previousActiveFormMessageId)
      setActivities((current) => current.map((item) => item.id === activityId
        ? { ...item, detail: message, status: "error" }
        : item))
      if (isFailedToFetchError(caught)) {
        setRetryAgentRequest(() => () => {
          void requestAgentTurn(undefined, settings, undefined, payload)
        })
      }
      if (/api key|rejected/i.test(message)) openAgentSettings()
    } finally {
      setTyping(false)
      setBusy(false)
    }
  }

  const retryFailedAgentRequest = () => {
    if (!retryAgentRequest || busy) return
    const retry = retryAgentRequest
    setRetryAgentRequest(null)
    retry()
  }

  const handleAgentFormSubmit = (submission: AgentFormSubmission) => {
    const direct = formSubmissionDraft(submission)
    const nextInput = mergeAgentPatch(input, direct.patch)
    const nextCaptured = Array.from(new Set([...capturedFields, ...direct.captured]))
    const stateCheckpoint = checkpoint()
    setInput(nextInput)
    setCapturedFields(nextCaptured)
    void requestAgentTurn(submission.summary, agentSettings, {
      history: messages,
      draft: nextInput,
      captured: nextCaptured,
      checkpoint: stateCheckpoint,
    })
  }

  const startNewConversation = async () => {
    if (replyTimerRef.current !== null) {
      window.clearTimeout(replyTimerRef.current)
      replyTimerRef.current = null
    }
    setConversationLoading(true)
    setHistoryError(null)
    try {
      const snapshot = emptyConversationSnapshot()
      const created = await createConversation({
        title: "New conversation",
        status: "intake",
        model: agentSettings.model,
        study_id: null,
        state: snapshot,
      })
      setConversationHydrated(false)
      restoreSnapshot(created.state)
      setConversationId(created.id)
      setConversations((current) => upsertConversationSummary(current, created))
      router.push(`/studies/new?conversation=${encodeURIComponent(created.id)}`, { scroll: false })
      setConversationHydrated(true)
    } catch (caught) {
      setHistoryError(errorMessage(caught))
    } finally {
      setConversationLoading(false)
    }
  }

  const openConversation = (nextConversationId: string) => {
    if (nextConversationId === conversationId || conversationLoading) return
    setConversationHydrated(false)
    router.push(`/studies/new?conversation=${encodeURIComponent(nextConversationId)}`, { scroll: false })
  }

  const renameConversation = async (targetConversationId: string, title: string) => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    setHistoryError(null)
    try {
      const state = targetConversationId === conversationId
        ? { ...makeSnapshot(), custom_title: trimmedTitle }
        : { ...(await getConversation<ConversationSnapshot>(targetConversationId)).state, custom_title: trimmedTitle }
      const saved = await updateConversation(targetConversationId, { title: trimmedTitle, state })
      setConversations((current) => upsertConversationSummary(current, saved))
      if (targetConversationId === conversationId) setCustomConversationTitle(trimmedTitle)
    } catch (caught) {
      setHistoryError(errorMessage(caught))
      throw caught
    }
  }

  const removeConversation = async (targetConversationId: string) => {
    setHistoryError(null)
    try {
      await deleteConversation(targetConversationId)
      const removedIndex = conversations.findIndex((conversation) => conversation.id === targetConversationId)
      const remaining = conversations.filter((conversation) => conversation.id !== targetConversationId)
      setConversations(remaining)
      if (targetConversationId !== conversationId) return

      setCustomConversationTitle(null)
      const nextConversation = remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)]
      if (nextConversation) {
        setConversationHydrated(false)
        router.push(`/studies/new?conversation=${encodeURIComponent(nextConversation.id)}`, { scroll: false })
      } else {
        await startNewConversation()
      }
    } catch (caught) {
      setHistoryError(errorMessage(caught))
      throw caught
    }
  }

  const resendEditedMessage = (messageId: string, editedText: string) => {
    if (busy) return
    const messageIndex = messages.findIndex((message) => message.id === messageId && message.role === "user")
    if (messageIndex < 0) return
    const selected = messages[messageIndex]
    const branchMessages = messages.slice(0, messageIndex)
    const restored = selected.checkpoint ?? emptyCheckpoint()
    setMessages(branchMessages)
    setInput(restored.input)
    setCapturedFields(restored.capturedFields)
    setStage(restored.stage)
    setActiveFormMessageId(restored.activeFormMessageId)
    setActivities((current) => current.slice(0, restored.activitiesLength))
    setArtifact(restored.artifact)
    setMapping(restored.mapping)
    if (restored.stage !== "mapping" && restored.stage !== "lineage") {
      setFile(null)
      setColumns([])
    }
    setError(null)
    pendingEditedMessageRef.current = editedText
  }

  const handleAnswer = (rawAnswer?: string) => {
    const answer = (rawAnswer ?? draft).trim()
    if (!answer || busy || stage === "freezing" || stage === "analysis" || stage === "complete") return
    setDraft("")
    setError(null)

    if (stage === "data") {
      appendUser(answer)
      ask("data", "At this point I need the analysis-ready dataset. Attach a CSV or Parquet file with the paperclip; I’ll inspect the schema before anything runs.")
      return
    }

    if (stage === "mapping") {
      appendUser(answer)
      if (/use|confirm|looks right|使用|确认|没问题/i.test(answer)) confirmMapping()
      else handleMappingCorrection(answer)
      return
    }
    if (stage === "lineage") {
      appendUser(answer)
      if (/confirm|no unrecorded|\byes\b|确认|没有未记录|无未记录/i.test(answer)) void runAnalysis()
      else ask("lineage", "I can’t run the audit until the transformation history is explicit. Confirm there was no unrecorded outcome-dependent cleaning, or upload a properly documented dataset.")
      return
    }
    if (stage === "review" && /freeze|confirm|冻结|确认/i.test(answer)) {
      appendUser(answer)
      void freezeDesign()
      return
    }
    if (/restart|重新|重来/i.test(answer)) {
      void startNewConversation()
      return
    }
    void requestAgentTurn(answer)
  }

  const handleQuickReply = (label: string) => {
    if (label === "Attach dataset") return fileInputRef.current?.click()
    if (label === "Upload another file") {
      setFile(null)
      setColumns([])
      if (fileInputRef.current) fileInputRef.current.value = ""
      setStage("data")
      appendUser(label)
      ask("data", "Attach the replacement CSV or Parquet file when you’re ready.")
      return
    }
    if (label === "Restart intake") return void startNewConversation()
    handleAnswer(label)
  }

  const canAttachDataset = !busy && (stage === "data" || stage === "mapping")

  const handleFileDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer.types.includes("Files") && canAttachDataset) setIsDraggingFile(true)
  }

  const handleFileDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = canAttachDataset ? "copy" : "none"
    if (event.dataTransfer.types.includes("Files") && canAttachDataset) setIsDraggingFile(true)
  }

  const handleFileDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDraggingFile(false)
  }

  const handleFileDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDraggingFile(false)
    if (!canAttachDataset) return
    void handleFile(event.dataTransfer.files?.[0] ?? null)
  }

  const handleFile = async (selected: File | null) => {
    if (!selected || busy) return
    const filename = selected.name.toLowerCase()
    if (!filename.endsWith(".csv") && !filename.endsWith(".parquet")) {
      setError("Please attach a CSV or Parquet file.")
      return
    }
    setFile(selected)
    setError(null)
    appendUser(`Attached ${selected.name}`, selected.name)
    setBusy(true)
    setStage("mapping")
    const activityId = nextActivityId("file")
    setActivities((current) => [...current, { id: activityId, kind: "file", label: "Inspect dataset schema", detail: selected.name, status: "running" }])
    appendTool(activityId)

    let detectedColumns: string[] = []
    if (selected.name.toLowerCase().endsWith(".csv")) {
      try {
        const firstChunk = await selected.slice(0, 16_384).text()
        detectedColumns = parseCsvHeader(firstChunk.split(/\r?\n/, 1)[0])
      } catch {
        detectedColumns = []
      }
    }
    setColumns(detectedColumns)
    const suggestion = suggestMapping(defaultMapping(input), detectedColumns, input)
    setMapping(suggestion)
    setActivities((current) => current.map((item) => item.id === activityId ? { ...item, detail: detectedColumns.length ? `${detectedColumns.length} columns detected` : "Schema preview unavailable", status: "done" } : item))

    const issues = mappingIssues(suggestion, detectedColumns, input)
    const message = issues.length
      ? `I found ${detectedColumns.length} columns, but I’m not confident about: ${issues.join(", ")}. Reply with corrections such as “unit=user_id, treatment=variant, metric=outcome”.`
      : `I found ${detectedColumns.length || "the proposed"} columns and prepared a mapping: ${mappingSummary(suggestion, input)}. Confirm it or reply with corrections.`
    setTyping(true)
    if (replyTimerRef.current !== null) window.clearTimeout(replyTimerRef.current)
    replyTimerRef.current = window.setTimeout(() => {
      appendAgent(message)
      setTyping(false)
      setBusy(false)
      replyTimerRef.current = null
    }, 220)
  }

  const handleMappingCorrection = (answer: string) => {
    const corrected = parseMappingCorrections(mapping, answer, input)
    setMapping(corrected)
    const issues = mappingIssues(corrected, columns, input)
    if (issues.length) ask("mapping", `I applied what I could, but these roles are still unresolved: ${issues.join(", ")}.`)
    else ask("mapping", `Updated. The mapping is now ${mappingSummary(corrected, input)}. Confirm to continue.`)
  }

  const confirmMapping = () => {
    const issues = mappingIssues(mapping, columns, input)
    if (issues.length) {
      ask("mapping", `I still need valid columns for: ${issues.join(", ")}. Reply with role=column pairs.`)
      return
    }
    ask("lineage", "Before I run anything: confirm there was no unrecorded outcome-dependent cleaning, row deletion, imputation, or window change applied to this file.")
  }

  const freezeDesign = async () => {
    if (readiness.state !== "ready") {
      setError("The analysis engine is still warming. The conversation is preserved; freeze when the engine is ready.")
      appendAgent("The analysis engine is still warming. I’ve kept every answer and will not freeze the contract until the service is ready.")
      setStage("review")
      return
    }
    setStage("freezing")
    setBusy(true)
    setTyping(false)
    appendAgent("I’m compiling the causal contract now. I’ll validate the inputs, calculate the design, freeze the policy, and persist the evidence schema.")
    const requestId = nextActivityId("api-design")
    setActivities((current) => [...current, { id: requestId, kind: "api", label: "POST /api/studies/design", detail: "Compile study design", status: "running" }])
    appendTool(requestId)
    try {
      const response = await createStudyDesign(input)
      if (!getStudyId(response)) throw new Error("The server returned a design without a study identifier.")
      setArtifact(response)
      setMapping(defaultMapping(input))
      const normalized = normalizeEvidence(response)
      const trace = traceActivities(normalized.trace, requestId)
      setActivities((current) => current.map((item) => item.id === requestId ? { ...item, detail: "200 · design persisted", status: "done" as const } : item))
      await revealTraceActivities(trace)
      setMessages((current) => [...current, {
        id: nextMessageId("agent"),
        role: "agent",
        text: "The design is frozen. The identifiers, assumptions, data contract, and decision thresholds are now versioned.",
        kind: "design",
      }])
      setStage("data")
    } catch (caught) {
      const message = errorMessage(caught)
      setError(message)
      setActivities((current) => current.map((item) => item.id === requestId ? { ...item, detail: message, status: "error" } : item))
      appendAgent(`I couldn’t freeze the design: ${message}`)
      setStage("review")
    } finally {
      setBusy(false)
    }
  }

  const runAnalysis = async () => {
    if (!artifact || !studyId || !file) {
      setError("A frozen design and dataset are required before analysis.")
      return
    }
    if (readiness.state !== "ready") {
      setError("The analysis engine is not ready yet. Your dataset mapping is preserved.")
      return
    }
    setStage("analysis")
    setBusy(true)
    setError(null)
    appendAgent("I’m binding the dataset to the frozen contract. The deterministic pipeline will hash the data, run evidence gates, execute the declared estimator, and apply the decision policy.")
    const requestId = nextActivityId("api-analysis")
    setActivities((current) => [...current, { id: requestId, kind: "api", label: `POST /api/studies/${studyId.slice(0, 12)}/analyze`, detail: file.name, status: "running" }])
    appendTool(requestId)
    try {
      const mappingPayload = {
        unit_col: mapping.unit_col,
        treatment_col: mapping.treatment_col,
        metric_cols: mapping.metric_cols,
        ...(input.design_type === "did" ? { time_col: mapping.time_col } : {}),
        covariate_cols: mapping.covariate_cols,
      }
      const result = await analyzeStudy(studyId, file, mappingPayload, { transformation_log: [] })
      let detail: StudyRecord | null = null
      try {
        detail = await getStudy(studyId)
      } catch {
        // The analysis response already contains the complete run.
      }
      const merged = mergeArtifacts(artifact, result, detail)
      setArtifact(merged)
      const normalized = normalizeEvidence(merged)
      const analysisTrace = normalized.trace.filter((item) => !DESIGN_TRACE_STEPS.has(item.step))
      const trace = traceActivities(analysisTrace, requestId)
      setActivities((current) => current.map((item) => item.id === requestId ? { ...item, detail: "200 · result persisted", status: "done" as const } : item))
      await revealTraceActivities(trace)
      setMessages((current) => [...current, {
        id: nextMessageId("agent"),
        role: "agent",
        text: String(normalized.decision.summary ?? "The audit and analysis are complete."),
        kind: "result",
      }])
      setStage("complete")
    } catch (caught) {
      const message = errorMessage(caught)
      setError(message)
      setActivities((current) => current.map((item) => item.id === requestId ? { ...item, detail: message, status: "error" } : item))
      appendAgent(`The analysis stopped before a decision was produced: ${message}`)
      setStage("lineage")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const editedText = pendingEditedMessageRef.current
    if (!editedText) return
    pendingEditedMessageRef.current = null
    const timer = window.setTimeout(() => handleAnswer(editedText), 0)
    return () => window.clearTimeout(timer)
    // Re-dispatch only after the checkpoint state and branched history commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  return (
    <>
      <AgentSettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsRequested(open)
          if (!open) setSettingsDismissed(true)
        }}
        settings={agentSettings}
        onSaved={() => {
          setSettingsRequested(false)
          setSettingsDismissed(true)
          setError(null)
        }}
      />
      <div className="flex h-dvh overflow-hidden bg-background">
        <ConversationHistorySidebar
          conversations={conversations}
          activeConversationId={conversationId}
          loading={conversationLoading}
          open={conversationSidebarOpen}
          onOpenChange={setConversationSidebarOpen}
          onSelect={openConversation}
          onNew={() => void startNewConversation()}
          onRename={renameConversation}
          onDelete={removeConversation}
        />

        <section className="flex min-w-0 flex-1 flex-col" aria-label="Study conversation">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/75 bg-background/90 px-3 backdrop-blur-xl sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Button type="button" variant="ghost" size="icon-sm" className="rounded-lg lg:hidden" onClick={() => setConversationSidebarOpen(true)} aria-label="Open conversation history"><PanelLeft className="h-4 w-4" /></Button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold">{activeConversationTitle}</h1>
                {conversationId && <code className="block truncate text-[9px] text-muted-foreground">{conversationId}</code>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="rounded-lg text-muted-foreground" aria-label="Toggle color theme" title="Toggle color theme">
                <Moon className="h-4 w-4 dark:hidden" />
                <Sun className="hidden h-4 w-4 dark:block" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={openAgentSettings} className="rounded-lg text-muted-foreground" aria-label="Agent settings" title="Agent settings"><Settings2 className="h-4 w-4" /></Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 sm:px-6">
            <div className="mx-auto max-w-3xl space-y-6">
              {conversationLoading && !conversationHydrated && <p className="py-10 text-center text-sm text-muted-foreground">Loading conversation…</p>}
              {readiness.state === "unavailable" && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-100">
                  <span>The analysis engine is unavailable.</span>
                  <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={readiness.retry}><RefreshCw className="h-3.5 w-3.5" />Retry</Button>
                </div>
              )}
              {messages.map((message) => (
                <ConversationMessage
                  key={`${conversationId ?? "pending"}-${message.id}`}
                  message={message}
                  activity={message.activityId ? activities.find((item) => item.id === message.activityId) : undefined}
                  input={input}
                  capturedFields={capturedFields}
                  evidence={evidence}
                  studyId={studyId}
                  active={message.id === activeFormMessageId}
                  busy={busy}
                  onFormSubmit={handleAgentFormSubmit}
                  onResend={resendEditedMessage}
                />
              ))}
              {typing && <TypingMessage />}
              {historyError && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">History sync paused: {historyError}</div>}
              {error && (
                <div role="alert" className="flex max-w-2xl items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span>{retryAgentRequest && <Button type="button" variant="ghost" size="icon-sm" onClick={retryFailedAgentRequest} className="-my-1 shrink-0 text-rose-800 hover:bg-rose-100 hover:text-rose-950 dark:text-rose-100 dark:hover:bg-rose-900/50 dark:hover:text-white" aria-label="Retry agent request" title="Retry"><RefreshCw className="h-4 w-4" /></Button>}</div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="shrink-0 bg-background/92 px-4 pb-4 pt-2 backdrop-blur-xl sm:px-6">
            <div className="mx-auto max-w-3xl">
              {quickReplies.length > 0 && (
                <div className="mb-2.5 flex gap-2 overflow-x-auto pb-1" aria-label="Suggested replies">
                  {quickReplies.map((reply) => <button key={reply} type="button" onClick={() => handleQuickReply(reply)} disabled={busy} className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition hover:border-slate-400 hover:bg-muted disabled:opacity-50">{reply}</button>)}
                </div>
              )}
              <div
                data-testid="dataset-dropzone"
                className={cn(
                  "relative rounded-2xl border border-border bg-card p-2 shadow-[0_12px_36px_-28px_rgba(15,23,42,0.65)] focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-400/15",
                  isDraggingFile && "border-slate-500 bg-slate-50 ring-2 ring-slate-400/30 dark:bg-slate-900/60",
                )}
                onDragEnter={handleFileDragEnter}
                onDragOver={handleFileDragOver}
                onDragLeave={handleFileDragLeave}
                onDrop={handleFileDrop}
              >
                {isDraggingFile && canAttachDataset && (
                  <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-slate-500 bg-background/90 px-4 text-center text-xs font-semibold text-foreground backdrop-blur-sm">
                    Drop CSV or Parquet here to attach the dataset
                  </div>
                )}
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      handleAnswer()
                    }
                  }}
                  rows={1}
                  maxLength={6000}
                  placeholder={!agentApiConfigured && stage === "intake" ? "Connect DeepSeek to start the conversation…" : placeholderFor(stage)}
                  disabled={conversationLoading || busy || stage === "complete" || (!agentApiConfigured && stage === "intake")}
                  className="max-h-36 min-h-11 resize-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
                  aria-label="Message the causal agent"
                />
                <div className="flex items-center justify-between gap-3 px-1 pb-1">
                  <div className="flex items-center gap-1">
                    <input ref={fileInputRef} type="file" accept=".csv,.parquet" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0] ?? null)} />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => fileInputRef.current?.click()} disabled={busy || (stage !== "data" && stage !== "mapping")} className="rounded-lg text-muted-foreground" aria-label="Attach dataset" title="Attach CSV or Parquet"><Paperclip className="h-4 w-4 translate-y-0.5" /></Button>
                    {!agentApiConfigured && stage === "intake" && <Button type="button" variant="ghost" size="sm" onClick={openAgentSettings} className="rounded-lg text-xs"><KeyRound className="h-3.5 w-3.5" /> Configure DeepSeek</Button>}
                  </div>
                  <Button type="button" size="icon-sm" onClick={() => handleAnswer()} disabled={!draft.trim() || conversationLoading || busy || stage === "complete" || (!agentApiConfigured && stage === "intake")} className="rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white" aria-label="Send message"><Send className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

function ConversationMessage({
  message,
  activity,
  input,
  capturedFields,
  evidence,
  studyId,
  active,
  busy,
  onFormSubmit,
  onResend,
}: {
  message: ChatMessage
  activity?: ActivityEvent
  input: StudyDesignInput
  capturedFields: AgentDraftField[]
  evidence: NormalizedEvidence | null
  studyId: string
  active: boolean
  busy: boolean
  onFormSubmit: (submission: AgentFormSubmission) => void
  onResend: (messageId: string, editedText: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.text)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
  }, [])

  if (message.role === "tool") {
    if (!activity) return null
    return <ToolActivityMessage activity={activity} />
  }

  const agent = message.role === "agent"

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopied(true)
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  const resend = () => {
    const nextText = editText.trim()
    if (!nextText || busy) return
    setEditing(false)
    if (nextText !== message.text) onResend(message.id, nextText)
  }

  return (
    <article className={cn("flex gap-3", !agent && "justify-end")}>
      <div className={cn("min-w-0", agent ? "max-w-[min(100%,48rem)] flex-1" : "group relative max-w-[min(85%,42rem)]")}>
        {editing ? (
          <div className="min-w-[min(34rem,78vw)] rounded-2xl border border-slate-300 bg-[#e5e5e1] p-2 shadow-sm dark:border-slate-600 dark:bg-slate-700">
            <Textarea
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  resend()
                }
                if (event.key === "Escape") {
                  setEditText(message.text)
                  setEditing(false)
                }
              }}
              autoFocus
              rows={2}
              maxLength={6000}
              className="max-h-48 min-h-20 resize-y border-0 bg-transparent text-sm leading-6 text-slate-950 shadow-none focus-visible:ring-0 dark:bg-transparent dark:text-slate-50"
              aria-label="Edit message"
            />
            <div className="mt-1 flex justify-end gap-1.5">
              <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={() => { setEditText(message.text); setEditing(false) }}><X className="h-3.5 w-3.5" />Cancel</Button>
              <Button type="button" size="sm" className="rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white" onClick={resend} disabled={!editText.trim() || busy}><Send className="h-3.5 w-3.5" />Send</Button>
            </div>
          </div>
        ) : (
          <div className={cn("whitespace-pre-wrap text-sm leading-6", agent ? "pt-1 text-foreground" : "rounded-2xl rounded-br-md bg-[#e5e5e1] px-4 py-2.5 text-slate-950 dark:bg-slate-700 dark:text-slate-50")}>
            {message.kind === "attachment" ? <span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />{message.attachmentName}</span> : message.text}
          </div>
        )}
        {!agent && !editing && (
          <div className="absolute -bottom-8 right-0 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-background/95 p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Button type="button" variant="ghost" size="icon-sm" className="h-6 w-6 rounded-md text-muted-foreground" onClick={() => void copyMessage()} aria-label="Copy message" title="Copy message">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>
            {message.kind !== "attachment" && <Button type="button" variant="ghost" size="icon-sm" className="h-6 w-6 rounded-md text-muted-foreground" onClick={() => setEditing(true)} disabled={busy} aria-label="Edit and resend message" title="Edit and resend"><Pencil className="h-3.5 w-3.5" /></Button>}
          </div>
        )}
        {agent && message.blocks?.map((block) => <AgentFormCard key={block.id} block={block} active={active} busy={busy} onSubmit={onFormSubmit} />)}
        {agent && message.kind === "review" && <IntakeSummary input={input} capturedFields={capturedFields} />}
        {agent && message.kind === "design" && evidence && <DesignSummary evidence={evidence} input={input} />}
        {agent && message.kind === "result" && evidence && <ResultSummary evidence={evidence} input={input} studyId={studyId} />}
      </div>
    </article>
  )
}

function ToolActivityMessage({ activity }: { activity: ActivityEvent }) {
  return (
    <article className="flex max-w-2xl gap-3" aria-live={activity.status === "running" ? "polite" : undefined}>
      <ActivityIcon kind={activity.kind} status={activity.status} />
      <div className="min-w-0 flex-1 rounded-lg border border-border/75 bg-muted/30 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <code className="truncate text-[11px] font-semibold text-foreground">{activity.label}</code>
          <span className={cn("shrink-0 font-mono text-[8px] uppercase tracking-wider", activity.status === "error" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>{activity.status}</span>
        </div>
        {activity.detail && <p className={cn("mt-1 text-[10px] leading-4", activity.status === "error" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>{activity.detail}</p>}
      </div>
    </article>
  )
}

function TypingMessage() {
  return <div className="flex items-center gap-1.5 py-2" aria-label="Agent is responding"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" /></div>
}

function IntakeSummary({ input, capturedFields }: { input: StudyDesignInput; capturedFields: AgentDraftField[] }) {
  const captured = new Set<AgentDraftField>(capturedFields)
  const fields = [
    ["Decision", captured.has("business_question") ? input.business_question : "Not captured"],
    ["Population", captured.has("population") ? input.population : "Not captured"],
    ["Intervention", captured.has("intervention") ? input.intervention : "Not captured"],
    ["Comparator", captured.has("comparison") ? input.comparison : "Not captured"],
    ["Primary metric", captured.has("primary_metric") ? input.primary_metric : "Not captured"],
    ["Minimum effect", captured.has("success_threshold") ? formatEffect(input.success_threshold, input.metric_type) : "Not captured"],
    ["Design", captured.has("design_type") ? input.design_type === "rct" ? "Randomized A/B" : "Difference-in-differences" : "Not captured"],
    ["Analysis unit", captured.has("randomization_unit") ? input.randomization_unit : "Not captured"],
  ]
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-3"><span className="flex items-center gap-2 text-xs font-bold"><MessageSquareText className="h-4 w-4 text-muted-foreground" />Captured contract</span><span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Draft</span></div>
      <dl className="grid sm:grid-cols-2">
        {fields.map(([label, value], index) => <div key={label} className={cn("border-border px-4 py-3", index > 1 && "border-t", index % 2 === 1 && "sm:border-l", index === 1 && "border-t sm:border-t-0")}><dt className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-1.5 text-xs font-medium leading-5">{value}</dd></div>)}
      </dl>
      <div className="border-t border-border px-4 py-3 text-[11px] leading-5 text-muted-foreground">Planning defaults: α = {input.alpha}, power = {input.power ?? 0.8}. The outcome window is {captured.has("metric_window_days") ? `${input.metric_window_days} days` : "not captured"}. Nothing is frozen until you confirm.</div>
    </div>
  )
}

function DesignSummary({ evidence, input }: { evidence: NormalizedEvidence; input: StudyDesignInput }) {
  const design = evidence.design
  const sample = numberValue(design.required_total_sample_size)
  const duration = numberValue(design.estimated_duration_days)
  const specHash = String(design.spec_hash ?? "—")
  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-xs font-bold"><CheckCircle2 className="h-4 w-4 text-slate-600 dark:text-slate-300" />Design frozen</span><code className="text-[9px] text-muted-foreground">{specHash.length > 14 ? `${specHash.slice(0, 8)}…${specHash.slice(-4)}` : specHash}</code></div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryMetric label="Method" value={input.design_type === "rct" ? "Randomized A/B" : "DiD"} />
        <SummaryMetric label="Required sample" value={sample === null ? "—" : Math.round(sample).toLocaleString()} mono />
        <SummaryMetric label="Est. duration" value={duration === null ? "—" : `${Math.round(duration)} days`} mono />
        <SummaryMetric label="Primary metric" value={input.primary_metric} mono />
      </div>
      <p className="mt-4 border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground"><UploadCloud className="mr-1.5 inline h-3.5 w-3.5" />Attach an analysis-ready CSV or Parquet file below. Raw rows stay inside deterministic analysis tools.</p>
    </div>
  )
}

function ResultSummary({ evidence, input, studyId }: { evidence: NormalizedEvidence; input: StudyDesignInput; studyId: string }) {
  const status = String(evidence.decision.status ?? evidence.decision.recommendation ?? "complete")
  const estimate = numberValue(evidence.effect.estimate)
  const passed = evidence.diagnostics.filter((item) => item.status === "pass").length
  const blocking = evidence.diagnostics.filter((item) => item.status === "fail").length
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-4 border-b border-border bg-muted/35 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Decision</p><p className="mt-1 text-lg font-bold capitalize">{status.replaceAll("_", " ")}</p></div><div className="flex gap-6"><SummaryMetric label="Estimate" value={estimate === null ? "—" : formatEffect(estimate, input.metric_type)} mono /><SummaryMetric label="Diagnostics" value={`${passed} pass · ${blocking} block`} mono /></div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="max-w-xl text-xs leading-5 text-muted-foreground">The complete record contains the contract, dataset hash, diagnostic messages, estimate, and agent trace.</p>{studyId && <Button asChild size="sm" variant="outline" className="rounded-lg"><Link href={`/studies/${studyId}`}>Open evidence record <ArrowRight /></Link></Button>}</div>
    </div>
  )
}

function SummaryMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p><p className={cn("mt-1.5 truncate text-xs font-semibold", mono && "font-mono")}>{value}</p></div>
}

function ActivityIcon({ kind, status }: { kind: ActivityKind; status: ActivityStatus }) {
  const Icon = kind === "python" ? SquareTerminal : kind === "api" ? Braces : kind === "storage" ? Database : kind === "file" ? FileCheck2 : Wrench
  return <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md border", status === "error" ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30" : status === "running" ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300" : "border-border bg-card text-muted-foreground")}><Icon className={cn("h-3.5 w-3.5", status === "running" && "animate-pulse")} /></span>
}

function initialMessages(requestedTemplate: string, hasTemplate: boolean): ChatMessage[] {
  if (hasTemplate) {
    const template = STUDY_TEMPLATES.find((item) => item.id === requestedTemplate)
    return [{ id: "agent-intro", role: "agent", text: `I loaded the ${template?.label ?? "study"} template. I have not frozen anything. Review the captured assumptions below, then confirm or ask for a change.`, kind: "review" }]
  }
  return [openingMessage()]
}

function initialCapturedFields(input: StudyDesignInput, hasTemplate: boolean, requestedMode: string | null): AgentDraftField[] {
  if (hasTemplate) return Object.keys(toAgentDraft(input)) as AgentDraftField[]
  if (requestedMode === "prospective" || requestedMode === "retrospective") return ["mode"]
  return []
}

function repliesFor(stage: ConversationStage, file: File | null): string[] {
  switch (stage) {
    case "review": return ["Freeze this design", "Change an answer", "Restart intake"]
    case "data": return ["Attach dataset"]
    case "mapping": return file ? ["Use suggested mapping", "Upload another file"] : ["Attach dataset"]
    case "lineage": return ["Confirm no unrecorded cleaning", "Upload another file"]
    default: return []
  }
}

function placeholderFor(stage: ConversationStage): string {
  if (stage === "data" || stage === "mapping") return "Attach a dataset or describe the column mapping…"
  if (stage === "freezing") return "Agent is freezing the design…"
  if (stage === "analysis") return "Agent is running diagnostics and estimation…"
  if (stage === "complete") return "Run complete — open the evidence record or start a new conversation"
  return "Reply to the Agent…"
}

function traceActivities(trace: AgentTraceStep[], prefix: string): ActivityEvent[] {
  return trace.map((item, index) => {
    const token = `${item.step} ${item.tool ?? ""}`.toLowerCase()
    const kind: ActivityKind = token.includes("estimator") || token.includes("diagnostic") || token.includes("design") ? "python" : token.includes("contract") || token.includes("decision") ? "tool" : token.includes("data") ? "storage" : "tool"
    return { id: `${prefix}-trace-${index}`, kind, label: item.step, detail: item.summary, status: "done" }
  })
}

function normalizeRestoredConversation(
  messages: ChatMessage[],
  activities: ActivityEvent[],
): { messages: ChatMessage[]; activities: ActivityEvent[] } {
  const skippedActivityIds = new Set(
    activities
      .filter((activity) => activity.id.startsWith("api-analysis-") && activity.id.includes("-trace-") && DESIGN_TRACE_STEPS.has(activity.label))
      .map((activity) => activity.id),
  )
  const normalizedActivities = activities.filter((activity) => !skippedActivityIds.has(activity.id))
  const activityById = new Map(normalizedActivities.map((activity) => [activity.id, activity]))
  const normalizedMessages: ChatMessage[] = []

  messages.forEach((sourceMessage, index) => {
    if (sourceMessage.activityId && skippedActivityIds.has(sourceMessage.activityId)) return
    const message = sourceMessage.role === "user" && sourceMessage.text.startsWith("Form response")
      ? {
          ...sourceMessage,
          text: sourceMessage.text.replace(/护栏指标\s*[（(]JSON\s*数组或[“"]无[”"][）)]/gu, "护栏指标"),
        }
      : sourceMessage
    normalizedMessages.push(message)

    if (!message.activityId) return
    const activity = activityById.get(message.activityId)
    const narration = activity ? TRACE_NARRATION[activity.label] : undefined
    if (!narration) return
    const nextMessage = messages[index + 1]
    if (nextMessage?.role === "agent" && nextMessage.text === narration) return
    normalizedMessages.push({
      id: `${message.id}-narration`,
      role: "agent",
      text: narration,
    })
  })

  return { messages: normalizedMessages, activities: normalizedActivities }
}

function numericSuffix(id: string): number {
  const match = id.match(/-(\d+)$/)
  return match ? Number(match[1]) : 0
}

function activitySequence(id: string): number {
  const match = id.match(/^(?:agent|file|api-design|api-analysis)-(\d+)$/)
  return match ? Number(match[1]) : 0
}

function emptyConversationSnapshot(): ConversationSnapshot {
  const input = cloneTemplate("")
  return {
    version: 1,
    input,
    captured_fields: [],
    stage: "intake",
    messages: [openingMessage()],
    active_form_message_id: OPENING_MESSAGE_ID,
    activities: [],
    artifact: null,
    mapping: defaultMapping(input),
    custom_title: null,
  }
}

function emptyCheckpoint(): ConversationCheckpoint {
  const snapshot = emptyConversationSnapshot()
  return {
    input: snapshot.input,
    capturedFields: [],
    stage: "intake",
    activeFormMessageId: OPENING_MESSAGE_ID,
    activitiesLength: 0,
    artifact: null,
    mapping: snapshot.mapping,
  }
}

function conversationTitle(input: StudyDesignInput, messages: ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.kind !== "attachment" && message.text.trim())
  const candidate = input.name.trim() || input.business_question.trim() || firstUserMessage?.text.trim() || "New conversation"
  return candidate.length > 72 ? `${candidate.slice(0, 69).trimEnd()}…` : candidate
}

function upsertConversationSummary(current: ConversationSummary[], conversation: ConversationSummary): ConversationSummary[] {
  const existingIndex = current.findIndex((item) => item.id === conversation.id)
  if (existingIndex < 0) return [conversation, ...current]
  return current.map((item, index) => index === existingIndex ? conversation : item)
}

function defaultMapping(input: StudyDesignInput): ColumnMapping {
  return {
    unit_col: input.randomization_unit,
    treatment_col: "treatment",
    time_col: input.design_type === "did" ? "time" : "",
    metric_cols: Object.fromEntries([[input.primary_metric, input.primary_metric], ...input.guardrails.map((item) => [item.name, item.name])].filter(([name]) => Boolean(name))),
    covariate_cols: input.cuped_covariate ? { [input.cuped_covariate]: input.cuped_covariate } : {},
  }
}

function suggestMapping(current: ColumnMapping, columns: string[], input: StudyDesignInput): ColumnMapping {
  const find = (...candidates: string[]) => {
    const normalized = columns.map((column) => ({ column, normalized: column.toLowerCase() }))
    for (const candidate of candidates.filter(Boolean)) {
      const exact = normalized.find((item) => item.normalized === candidate.toLowerCase())
      if (exact) return exact.column
    }
    for (const candidate of candidates.filter(Boolean)) {
      const partial = normalized.find((item) => item.normalized.includes(candidate.toLowerCase()))
      if (partial) return partial.column
    }
    return ""
  }
  return {
    unit_col: find(input.randomization_unit, "user_id", "unit_id", "account_id", "server_id", "id") || current.unit_col,
    treatment_col: find("treatment", "variant", "group", "treated") || current.treatment_col,
    time_col: input.design_type === "did" ? find("time", "date", "period", "week") || current.time_col : "",
    metric_cols: Object.fromEntries(Object.keys(current.metric_cols).map((metric) => [metric, find(metric, "outcome", "metric") || current.metric_cols[metric]])),
    covariate_cols: Object.fromEntries(Object.keys(current.covariate_cols).map((metric) => [metric, find(metric) || current.covariate_cols[metric]])),
  }
}

function mappingIssues(mapping: ColumnMapping, columns: string[], input: StudyDesignInput): string[] {
  const valid = (value: string) => Boolean(value) && (columns.length === 0 || columns.includes(value))
  const issues: string[] = []
  if (!valid(mapping.unit_col)) issues.push("analysis unit")
  if (!valid(mapping.treatment_col)) issues.push("treatment assignment")
  if (input.design_type === "did" && !valid(mapping.time_col)) issues.push("time")
  if (!valid(mapping.metric_cols[input.primary_metric] ?? "")) issues.push(`primary metric (${input.primary_metric})`)
  for (const guardrail of input.guardrails) if (!valid(mapping.metric_cols[guardrail.name] ?? "")) issues.push(`guardrail (${guardrail.name})`)
  return issues
}

function mappingSummary(mapping: ColumnMapping, input: StudyDesignInput): string {
  const parts = [`unit → ${mapping.unit_col}`, `treatment → ${mapping.treatment_col}`, `metric → ${mapping.metric_cols[input.primary_metric]}`]
  if (input.design_type === "did") parts.push(`time → ${mapping.time_col}`)
  return parts.join("; ")
}

function parseMappingCorrections(current: ColumnMapping, answer: string, input: StudyDesignInput): ColumnMapping {
  const next = { ...current, metric_cols: { ...current.metric_cols }, covariate_cols: { ...current.covariate_cols } }
  const pairs = [...answer.matchAll(/([a-zA-Z_ ]+)\s*(?:=|:|\bis\b)\s*([a-zA-Z0-9_.-]+)/g)]
  for (const match of pairs) {
    const role = match[1].trim().toLowerCase()
    const column = match[2].trim()
    if (role.includes("unit") || role === "id") next.unit_col = column
    else if (role.includes("treatment") || role.includes("group") || role.includes("variant")) next.treatment_col = column
    else if (role.includes("time") || role.includes("date") || role.includes("period")) next.time_col = column
    else if (role.includes("metric") || role.includes("outcome")) next.metric_cols[input.primary_metric] = column
    else {
      const guardrail = input.guardrails.find((item) => role.includes(item.name.toLowerCase()))
      if (guardrail) next.metric_cols[guardrail.name] = column
    }
  }
  return next
}

function parseCsvHeader(line: string): string[] {
  const matches = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g) ?? []
  return matches.map((value) => value.replace(/^,/, "").replace(/^"|"$/g, "").replaceAll('""', '"').trim()).filter(Boolean)
}

const NUMERIC_AGENT_FIELDS = new Set<AgentDraftField>([
  "success_threshold",
  "baseline_rate",
  "outcome_standard_deviation",
  "traffic_per_day",
  "metric_window_days",
  "minimum_pre_periods",
])

function formSubmissionDraft(submission: AgentFormSubmission): { patch: AgentDraft; captured: AgentDraftField[] } {
  const patch: Record<string, unknown> = {}
  const captured: AgentDraftField[] = []

  for (const [field, rawValue] of Object.entries(submission.values) as Array<[AgentDraftField, string | string[] | undefined]>) {
    if (rawValue === undefined) continue
    if (field === "guardrails") {
      const text = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue
      if (/^(none|no guardrails?|无|没有|不需要)$/i.test(text.trim())) {
        patch[field] = []
        captured.push(field)
      }
      continue
    }
    if (Array.isArray(rawValue) || !rawValue.trim()) continue
    if (NUMERIC_AGENT_FIELDS.has(field)) {
      const numericValue = Number(rawValue)
      if (!Number.isFinite(numericValue)) continue
      patch[field] = numericValue
    } else {
      patch[field] = rawValue.trim()
    }
    captured.push(field)
  }

  return { patch: patch as AgentDraft, captured }
}


function mergeAgentPatch(input: StudyDesignInput, patch: AgentDraft): StudyDesignInput {
  return {
    ...input,
    ...patch,
    mde: patch.success_threshold ?? input.mde,
  }
}

function formatEffect(value: number, metricType: StudyDesignInput["metric_type"]): string {
  return metricType === "binary" ? `${(value * 100).toFixed(2)} pp` : value.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function mergeArtifacts(base: StudyRecord, result: StudyRecord, detail: StudyRecord | null): StudyRecord {
  return {
    ...base,
    ...result,
    ...(detail ?? {}),
    contract: detail?.contract ?? result.contract ?? base.contract,
    causal_contract: detail?.causal_contract ?? result.causal_contract ?? base.causal_contract,
    design: detail?.design ?? result.design ?? base.design,
    design_spec: detail?.design_spec ?? result.design_spec ?? base.design_spec,
    data_contract: detail?.data_contract ?? result.data_contract ?? base.data_contract,
    trace: detail?.trace ?? result.trace ?? base.trace,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please retry."
}

function isFailedToFetchError(error: unknown): boolean {
  return error instanceof Error && error.message === "Failed to fetch"
}

function waitForAgentRetry(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 600))
}

function waitForWorkflowStep(delay = 180): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delay))
}
