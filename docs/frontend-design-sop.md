# Frontend design SOP

The user's instruction: copy **uiarc.dev** closely, including fonts, animation,
and small visual details. This is the project's continuing design language.
Apply it to existing screens and every new frontend feature.

## Project memory and authority

`AGENTS.md` is the automatic discovery entry for agents working in the repository.
This SOP is the detailed specification. The checked-in foundation and shared
components are the executable source of truth. Keep all three consistent.
Do not rely on remembering an earlier chat or a preference in one developer's
account. Repository files are versioned, reviewable, and available to teammates.

The current reference was inspected on 2026-10-29 through the site's public docs
and its [official source repository](https://github.com/kuratlielia/arc-library).
Keep this revision stable between features. A future redesign of the reference
site does not silently change this project's design.

## Reference sources

| Item | Upstream source | Git blob revision |
| --- | --- | --- |
| Foundation | `registry/foundation.css` | `cc976ca700b6b951a25148998b6c435ae4bf9f72` |
| Segmented control CSS | `registry/components/segmented-control/segmented-control.module.css` | `58f10e3191cdbc2ecf782b3687e71a14194fa4ec` |
| Input CSS reference | `registry/components/input/input.module.css` | `c836b587ba749d8ae352ca18460e92ca0ac9aec8` |
| Dialog CSS reference | `registry/components/dialog/dialog.module.css` | `c6a8baf4c381edea7dcffeb7840301d860428b12` |
| Button CSS reference | `registry/components/button/button.module.css` | `9bdba5738c23dc12376982b2213657db57a141ed` |

The upstream MIT license is retained in `frontend/public/licenses/arc-library.txt`.
The foundation's only mechanical changes are prefixing non-`arc-` variables with
`arc-`, and replacing `:root[data-theme="dark"]` with `.dark` for next-themes.
Do not edit its numerical values during ordinary feature work. Map its tokens
to application roles in `frontend/app/globals.css`.

## Typography

| Role | Family | Rule |
| --- | --- | --- |
| Page and section headings | Geist Variable | Usually 500 weight; display tracking −0.03em and line height 1.1 |
| Body, controls, navigation, tables | Inter Variable | Usually 400–500 weight; body tracking −0.01em and line height 1.4 |
| Dialog title | Inter Variable | 18px, 500 weight, line height 1.4 |
| Control label | Inter Variable | 14px, 500 weight |
| Code and hashes | Existing code stack | Tabular numbers; wrap long hashes |

Use the local variable font files in `frontend/public/fonts/`, bundled from
`@fontsource-variable/inter@5.3.0` and `@fontsource-variable/geist@5.3.0` with their
licenses. Normal weight ranges are 100–900. Use the supplied Latin and Latin
Extended subsets. Do not replace these with a system-font approximation or add a
runtime Google Fonts request. CJK glyphs use the explicit interface fallback.

Reports deliberately retain compact heading and numeric sizes: approximately
24px cover titles, 16px section titles, 18px principal values, and 12–13px body
content. Do not enlarge them into marketing KPIs. Downloaded HTML embeds the
same fonts so the design survives offline use.

## Surfaces, spacing, and controls

Use the exact upstream neutral palette, not a visually estimated gray. Light
mode is white with subtle neutral fills; dark mode has separately tuned surface
values. Primary buttons use foreground/background. Lavender-to-peach gradients
are limited to the upstream soft wash and small brand accents.

| Property | Upstream token/value |
| --- | --- |
| Spacing | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px |
| Control radius | `--arc-radius-control`: 18px |
| Panel radius | `--arc-radius-panel`: 26px |
| Large surface radius | `--arc-radius-surface`: 34px |
| Control heights | Small 36px; medium 44px; large 50px |
| Input border | `--arc-border-strong`; foreground on hover/focus |
| Resting/raised/floating shadow | Use the three upstream shadow tokens exactly |
| Dialog overlay | `oklch(10% 0 0 / .46)`; 7px backdrop blur |

Use `Button`, `Input`, `Textarea`, `Select`, `Dialog`, `Checkbox`, `Switch`, and
`SegmentedControl` from `components/ui/`. Use `ThemeToggle` for appearance changes.
Reuse `.study-panel`, `.panel-heading`, `.panel-body`, and the report classes for
grouping. Do not create another visual system inside a new feature.

Use the neutral action palette consistently. Keep success, caution, and failure
semantic and pair them with labels. Charts use the Arc series palette; do not
change the meaning of a statistical result to suit a decoration.

## Motion

Use `frontend/lib/motion.ts` for Motion transitions and the foundation's CSS
variables for CSS transitions. Transitions should settle without overshoot.

| Purpose | Preset |
| --- | --- |
| Immediate response | 120ms |
| Hover and color | 160ms |
| Ordinary transition | 240ms |
| Content entrance | 480ms; enter easing `(0.16, 1, 0.3, 1)` |
| Standard easing | `(0.22, 1, 0.36, 1)` |
| Small interactions | `spring.snappy`: visual duration .26s; bounce 0 |
| Panels and layout | `spring.smooth`: visual duration .4s; bounce 0 |
| Sliding selection | `spring.morph`: visual duration .42s; bounce 0 |
| CSS spring | Upstream `--arc-ease-spring` with 580ms |
| Content staggering | 35ms per item; keep total under about 400ms |

Buttons compress subtly on press and settle back. Segmented controls move one
shared selection surface; labels must not jump or change weight. Do not scale
triggers whose geometry positions a menu or dialog. Use the current shared
dialog entrance (8px rise, .96 initial scale), and a shorter exit.

Respect `prefers-reduced-motion` in both CSS and Motion. Preserve keyboard focus
and arrow/Home/End behavior, skip disabled segments, and keep overflow scrollable
on narrow screens. Decorative entrances never represent statistical progress:
loading states and steps must still reflect actual API operations.

## New feature procedure

1. Read root `AGENTS.md`, this SOP, and the relevant existing shared component.
2. Identify the existing page or panel pattern that fits the feature. Place new
   functionality in that pattern, with useful content and no redundant labels.
3. Reuse tokens and controls. If a primitive is missing, inspect its free public
   Arc source and adapt it to the project's API, preserving its visual/motion
   details, accessibility, provenance, and license.
4. Implement in `frontend/`. Keep behavior, causal contracts, validation, and
   reporting intact. Any exported view must use the same design language.
5. Run `python scripts/sync_sites_frontend.py`. Preserve Site identity, Worker
   behavior, D1 bindings, migrations, and newer deployed work.
6. Run appropriate type checks, existing regression tests, and the production
   build. Check representative overview, conversation, demo, report, library,
   settings, and export states. Use available browser QA for light/dark modes,
   narrow screens, keyboard navigation, open layers, and reduced motion.
7. Compare the implemented details against the pinned reference. Fix observed
   discrepancies. Record any browser verification limit honestly; do not claim
   a pixel comparison or animation verification that was not performed.
8. Update this SOP and the shared code together if the user explicitly changes
   the design language. Publish through the existing Sites workflow unless the
   requested scope is local-only.

## Acceptance criteria

New features should look like they belong beside the existing Arc controls:
the same fonts, hierarchy, token values, corner shapes, interaction states, and
motion. A change is incomplete if only the homepage follows the reference, or
if its new CSS introduces independent colors, radii, font stacks, or animation
curves without a documented reason.

## Readability update — 2026-10-29

The user explicitly requested larger text throughout the Site. Use a minimum
14px for captions, tables and report body text; default interface body text is
16px and navigation/labels are 15px. This supersedes the earlier 12–13px report
body guidance above. Preserve the local Inter/Geist families and the formal
report hierarchy. Preload the local Latin fonts and keep the shared navigation
mounted during internal transitions.
