# Teum Portal Design System (MASTER)

- **Style Direction**: Gentle Swiss Minimal (`minimalism-and-swiss-style`, toned slightly softer for daily student mobile use)
- **Dials**: Variance `4/10` · Motion `3/10` · Density `7/10`
- **Primary Pages**: `index.html` (`style.css`), `pledge.html`, `admin.html`

## Color Tokens

| Token | Light Mode | Dark Mode | Purpose |
|---|---|---|---|
| `--accent` | `#257A54` | `#5BB98C` | Primary Seojeon Sage Green accent |
| `--accent-fg` | `#FFFFFF` | `#0E1712` | High-contrast label on filled accent |
| `--accent-weak` | `#EAF4EE` | `rgba(91, 185, 140, 0.18)` | Active chips, now-period highlight |
| `--bg` | `#F4F5F7` | `#111315` | Clean Gray / low-glare Charcoal canvas |
| `--surface` | `#FFFFFF` | `#191C20` | Card and shell background |
| `--surface-subtle` | `#EEF0F3` | `#21252B` | Secondary controls, subtle rows |
| `--text` | `#191F28` | `#ECEFF4` | Primary body copy |
| `--text-muted` | `#5E646C` | `#9AA2AE` | Secondary metadata (WCAG AA pass) |
| `--border` | `#E2E5EA` | `rgba(255, 255, 255, 0.09)` | 1px Swiss hairline dividers |
| `--warn-text` | `#C81E2B` | `#FB7185` | Allergen / urgent alert (5.09:1+ AA) |
| `--live-text` | `#146C43` | `#34D399` | Live / positive status (5.87:1+ AA) |

## Typography & Geometry

- **Font**: `Pretendard Variable` (`pretendardvariable-dynamic-subset.min.css`), fallback system sans-serif.
- **Numeric Alignment**: `font-variant-numeric: tabular-nums` globally on `body` for timetables, D-Day counters, calories, and accounting rows.
- **Radius Scale**: `10px` (compact strips, inputs, buttons) · `12px` (bento cards, carousel slides, cover images) · `18px` (bottom-sheet top corners).
- **Elevation & Dividers**: Flat `box-shadow: none` on cards; `1px solid var(--border)` hairline section separation.
