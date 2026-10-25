# Causal study workspace

The interface presents causal study design, data preparation, and evidence
reports for a general audience.

## Design references

The visual reference is the current Vandy Food Radar workspace stylesheet at
`sites/public/static/app.css` in that project: system typography, white surfaces,
subtle gray backgrounds, fine borders, rounded controls, and restrained blue
emphasis. This project uses a persistent research navigation rail and a separate
study conversation layout.

Apple's primary design references:

- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout):
  group related content, establish a clear hierarchy, progressively reveal
  detail, and adapt to available space.
- [Typography](https://developer.apple.com/design/human-interface-guidelines/typography):
  use readable system typography and distinguish information by size and weight.

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
Vinext RSC navigation failure that prevented sidebar links and programmatic
report links from opening. Adding a newly created conversation ID uses
`history.replaceState` to preserve the active document and attached files.
Opening another conversation navigates to its persisted snapshot.

Verification uses the minified Worker build and the authenticated deployed
Site. It covers navigation, study search and filters, conversation creation
and restoration, settings, theme switching, the live analysis workflow,
report dimensions and details, and CSV/design/memo downloads.
