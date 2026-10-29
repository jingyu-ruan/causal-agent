# Causal study workspace

The interface presents causal study design, data preparation, and evidence
reports for a general audience.

## Design references

The primary visual and interaction reference is [uiarc.dev](https://uiarc.dev/),
as requested by the user. It supersedes the previous Food Radar and Apple visual
references. This direction applies to the entire interface: overview, navigation,
study conversation, demonstration, library, evidence reports, and settings.

Match the reference's typography (font family, weights, sizes, line height, and
letter spacing), layout and spacing, colors, surfaces, borders, shadows, icons,
and control styling. Use its motion language for entrances, hover and pressed
states, panels, and transitions. The implementation uses the public Arc Library
foundation, Geist and Inter variable fonts, and its published motion presets.
The [frontend design SOP](frontend-design-sop.md) records the source revision,
exact parameters, component rules, and workflow for future changes. Read it before
adding or changing interface elements.

Keep the interface responsive, preserve visible keyboard focus, and respect
`prefers-reduced-motion`. Execution indicators must continue to reflect actual
operations.

The canonical implementation lives in `frontend/`. Shared tokens and workspace
styles are in `frontend/app/globals.css`; shared controls are in
`frontend/components/ui/`. The global shell is one compact in-flow top
navigation in `frontend/components/site-nav.tsx`; there is no fixed side rail or
title bar. Both that navigation and the separate study conversation layout need
to follow the same reference. Synchronize completed interface changes into
`sites/` with `python scripts/sync_sites_frontend.py`.

## Presentation sequence

The overview introduces the research workflow without course, institution, or
reviewer-specific branding. The live demonstration prepares
actual data and waits for explicit review before analysis. The final report
exposes the frozen contract, primary estimate, evidence gates, lineage, and
reproducibility trace. Reference studies illustrate different decision outcomes.

The demonstration's progress indicators reflect completed API operations. The
interface does not use a timed story to represent statistical execution.
Generated data is explicitly labeled synthetic throughout the demonstration.

## Entry points

- `/`: Capstone overview and method selection.
- `/studies/replay`: executable A/B or DiD demonstration.
- `/studies/new`: conversational intake, with sample-study shortcuts.
- `/studies/new?template=onboarding`: keyless review of an A/B study template.
- `/studies/new?template=regional-rollout`: keyless review of a DiD template.
- `/studies`: searchable designs, analysis records, and verified reference cases.
- `/studies/[id]`: persistent evidence report and artifact downloads.

Upload and generated-data paths share the frozen study contract, data profiler,
confirmed cleaning plan, and deterministic analysis API. The model key is
required for custom agent conversation turns; the guided demonstration and
provided templates can proceed with the statistical service alone.

## Navigation verification

Page links use standard document navigation. This avoids a production-only
Vinext RSC navigation failure that prevented shared navigation links and
programmatic report links from opening. Adding a newly created conversation ID uses
`history.replaceState` to preserve the active document and attached files.
Opening another conversation navigates to its persisted snapshot.

Verification uses the minified Worker build and the authenticated deployed
Site. It covers navigation, study search and filters, conversation creation
and restoration, settings, theme switching, the live analysis workflow,
report dimensions and details, and CSV/design/memo downloads.
