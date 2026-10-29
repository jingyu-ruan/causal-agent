# Project memory

## Frontend design preference

The user's standing instruction for this project is:

> We gonna avoid unnecessary secondary labels and descriptions and let the layout do the explaining.

Use spacing, alignment, grouping and restrained typography to establish hierarchy.
Remove redundant subtitles, helper descriptions and decorative labels. Retain text
that conveys business context, units, evidence limitations or consequential choices.

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

The user's newest explicit request replaces the fixed full-height left menu and
the fixed title bar with one compact in-flow top navigation, and reduces the
interface text slightly: 15px body, 14px labels and navigation, 13px compact
captions. Report body copy stays at 14px and statistical values keep their
sizes. This supersedes the earlier 16px body / 15px label readability update.
The navigation lives in `frontend/components/site-nav.tsx`; see the
[navigation and type scale section](docs/frontend-design-sop.md#navigation-and-type-scale--2026-10-29-later-request)
of the SOP before changing the shell.
