// Arc Library motion presets, adapted under MIT. See /licenses/arc-library.txt.
export const motionTokens = {
  duration: { instant: 0.12, fast: 0.16, exit: 0.18, standard: 0.24, considered: 0.48 },
  ease: { enter: [0.16, 1, 0.3, 1], standard: [0.22, 1, 0.36, 1] },
  spring: {
    snappy: { type: "spring", visualDuration: 0.26, bounce: 0 },
    smooth: { type: "spring", visualDuration: 0.4, bounce: 0 },
    morph: { type: "spring", visualDuration: 0.42, bounce: 0 },
  },
} as const
