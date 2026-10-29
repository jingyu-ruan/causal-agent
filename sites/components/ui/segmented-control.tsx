"use client"

import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react"
import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import { motionTokens } from "@/lib/motion"
import { cn } from "@/lib/utils"
import styles from "./segmented-control.module.css"

type Option<T> = { value: T; label: ReactNode; disabled?: boolean }

export function SegmentedControl<T extends string>({
  options, value, onValueChange, label, className,
}: {
  options: readonly Option<T>[]
  value: T
  onValueChange: (value: T) => void
  label: string
  className?: string
}) {
  const id = useId()
  const reduced = useReducedMotion()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const track = useRef<HTMLDivElement>(null)
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index])
  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled)
  const tabIndex = selectedIndex < 0 ? enabled[0] : selectedIndex

  useLayoutEffect(() => {
    const node = track.current
    if (!node) return
    function edges() {
      if (!node) return
      node.toggleAttribute("data-fade-start", node.scrollLeft > 1)
      node.toggleAttribute("data-fade-end", node.scrollWidth - node.clientWidth - node.scrollLeft > 1)
    }
    edges()
    node.addEventListener("scroll", edges, { passive: true })
    const observer = new ResizeObserver(edges)
    observer.observe(node)
    return () => { observer.disconnect(); node.removeEventListener("scroll", edges) }
  }, [options.length])

  useEffect(() => {
    const node = track.current
    const button = buttons.current[selectedIndex]
    if (!node || !button || node.scrollWidth <= node.clientWidth) return
    const left = button.offsetLeft - node.offsetLeft
    if (left < node.scrollLeft) node.scrollTo({ left: Math.max(0, left - 20) })
    else if (left + button.offsetWidth > node.scrollLeft + node.clientWidth) node.scrollTo({ left: left + button.offsetWidth - node.clientWidth + 20 })
  }, [selectedIndex])

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!enabled.length) return
    const current = enabled.indexOf(index)
    let next: number
    switch (event.key) {
      case "ArrowRight": case "ArrowDown": next = enabled[(current + 1) % enabled.length]; break
      case "ArrowLeft": case "ArrowUp": next = enabled[(current - 1 + enabled.length) % enabled.length]; break
      case "Home": next = enabled[0]; break
      case "End": next = enabled[enabled.length - 1]; break
      default: return
    }
    event.preventDefault()
    onValueChange(options[next].value)
    buttons.current[next]?.focus({ preventScroll: true })
  }

  return <LayoutGroup id={id}>
    <div className={cn(styles.root, className)} role="group" aria-label={label}>
      <motion.div ref={track} layoutScroll className={styles.track}>
      {options.map((option, index) => <button
        key={option.value}
        ref={(node) => { buttons.current[index] = node }}
        type="button"
        className={styles.button}
        disabled={option.disabled}
        aria-pressed={option.value === value}
        tabIndex={index === tabIndex ? 0 : -1}
        onClick={() => onValueChange(option.value)}
        onKeyDown={(event) => navigate(event, index)}
      >
        {option.value === value && <motion.span className={styles.selection} layoutId="selection" initial={false} transition={reduced ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" />}
        <span className={styles.label}>{option.label}</span>
      </button>)}
      </motion.div>
    </div>
  </LayoutGroup>
}
