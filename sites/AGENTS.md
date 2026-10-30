# Project memory

## Frontend design preference

The user's standing instruction for this project is:

> We gonna avoid unnecessary secondary labels and descriptions and let the layout do the explaining.

Use spacing, alignment, grouping and restrained typography to establish hierarchy.
Remove redundant subtitles, helper descriptions and decorative labels. Retain text
that conveys business context, units, evidence limitations or consequential choices.

## Interface language

The user's standing instruction is that the product interface is English-only.
Every authored string and every assistant-generated interface response must be
English: agent messages, form titles, descriptions, labels, placeholders, helper
text, option labels, suggestion bases, recovery forms and reference evidence
answers, whatever language the user writes in.

Input recognition is unchanged. Intake and evidence questions are still
interpreted in Chinese, `lib/column-mapping.ts` still matches Chinese metric and
column terms, and user-supplied text — a research question, a metric name, an
imported column name, a stored conversation — is study data. Display and store
it verbatim. Never blank, strip or regex-rewrite Chinese user content.

The intake locale is fixed, not detected. `INTERFACE_LOCALE` in
`lib/agent-api.ts` in this checkout is its only source, the browser language is never
read, and `POST /api/agent/intake` normalizes any requested locale to `en` before
composing the prompt or a deterministic recovery form. Both intake system prompts
(`backend/agent.py` in the full repository and `lib/openrouter-contract.ts`) require English
replies. Do not add a translation framework or a language toggle. See the
[interface language section](docs/frontend-design-sop.md#interface-language--2026-10-29)
of the SOP before changing generated copy.

## Analysis reports

Reports should look formal and use compact, consistent typography. Avoid oversized
titles and KPI numbers. Author reports as semantic HTML with print CSS; produce PDF
from that HTML. The final HTML report must remain interactive: subgroup selection,
rollout assumptions, truth reveal and appendix expansion should work in the exported
document as well as in the application. Preserve statistical calculations and clear
uncertainty while simplifying presentation.

The full project keeps its canonical frontend in `frontend/` and mirrors it into
`sites/`. This checkout contains the deployed Sites source. When the full checkout
is available, update the canonical frontend and run its synchronization script.
Preserve the Worker, hosting identity and database migrations.

## Arc design language

The user's latest standing instruction is to copy uiarc.dev closely, down to
typography, control details, and animation, and to use that language for all new
frontend features. Read [the design SOP](docs/frontend-design-sop.md) before UI
work. Reuse the checked-in Arc foundation, local Geist/Inter variable fonts,
shared controls, and motion presets. Keep the formal report hierarchy and
interactive exports. Do not substitute a merely similar visual style.

In this deployment checkout, canonical `frontend/` paths in the SOP correspond
to the checkout root. When the full repository is present, update its canonical
interface and synchronize styles, fonts, and report source into `sites/`.

The user's earlier request replaced the fixed full-height left menu and
the fixed title bar with one compact top navigation, and reduced the
interface text slightly: 15px body, 14px labels and navigation, 13px compact
captions. Report body copy stays at 14px and statistical values keep their
sizes. This supersedes the earlier 16px body / 15px label readability update.
The navigation lives in `components/site-nav.tsx` in this checkout; see the
[navigation and type scale section](docs/frontend-design-sop.md#navigation-and-type-scale--2026-10-29-later-request)
of the SOP before changing the shell.

The user's newest explicit request makes that top navigation answer the scroll
direction and the scroll speed: it sticks to the viewport top, hides with a
quiet upward slide while scrolling down quickly, and returns promptly on quick
upward scrolling. Slow scrolling in either direction keeps whatever state the
row is already in, and slow travel never accumulates into a hide or a reveal.
The first 80px of the document always shows the row, whatever the speed. The
defaults are `TOP_PIN_DISTANCE` 80px and `SCROLL_SPEED_THRESHOLD` 0.2 CSS px/ms
(200px/s) for both directions. This supersedes the in-flow-only,
nothing-overlays description of the row and the earlier unconditional
first-pixel hide. The row keeps its layout space, stays on screen near the top
of the page, while a menu is open and while a keyboard-focused control needs it,
and ignores small jitter. Sticky asides and scroll anchors offset themselves by
`--nav-offset` so the revealed row covers no control. See the
[scroll behavior section](docs/frontend-design-sop.md#scroll-behavior--2026-10-29-newest-request)
of the SOP before changing the shell.
