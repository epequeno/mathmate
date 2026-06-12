# MathMate — Design & Style Guide

**Design file:** `mathmate.paper` → "mockups" page  
**Design guide:** `mathmate.paper` → "design guide" page  
**Mood:** Bookish — warm parchment (light) · carbon ink on worn leather (dark)  
**Status:** Dark theme is the active / shipped theme. Light theme tokens are preserved below for reference.

---

## Table of Contents

1. [Color Palette](#1-color-palette)
2. [Typography](#2-typography)
3. [Spacing](#3-spacing)
4. [Border Radius](#4-border-radius)
5. [Core Components](#5-core-components)
6. [Iconography](#6-iconography)
7. [Elevation & Shadows](#7-elevation--shadows)
8. [Layout Grid](#8-layout-grid)
9. [Session Manager](#9-session-manager)
10. [Animation & Motion](#10-animation--motion)
11. [UI Copy Style](#11-ui-copy-style)
12. [States to Handle](#12-states-to-handle)

---

## 1. Color Palette

### 1.1 Dark Theme (active)

> Extracted directly from the Paper mockups — these are the canonical values.

#### Surfaces & Backgrounds

| Token | Hex | Usage |
|---|---|---|
| `bg-app` | `#232120` | Main window background, chat area, session table |
| `bg-elevated` | `#1C1A18` | Sidebar, toolbar, tab bar, detail panel, settings panel, input bar |
| `bg-surface` | `#2C2926` | Input fields, secondary cards, filter pills (inactive), memory entries |
| `color-border` | `#3C3834` | All 1px dividers, borders, card outlines |

#### Text

| Token | Hex | Usage |
|---|---|---|
| `text-primary` | `#E8E3D9` | All primary body text, headings, session titles |
| `text-secondary` | `#7A7167` | Muted labels, timestamps, project names, inactive nav |
| `text-tertiary` | `#6E6860` | Section headers (uppercase), placeholders, hint text, disclaimer |

#### Accent (Prussian Blue family)

| Token | Hex | Usage |
|---|---|---|
| `accent` | `#3A5CA8` | Primary CTA buttons, New Project button, active filter pill |
| `accent-light` | `#5A7ED4` | Active tab underline, active tab text, selected state text, Session Manager nav item |
| `accent-selected` | `#2B4B8C` | Selected session row bg, selected table row bg, active nav item bg |
| `accent-border` | `#2A4078` | Manual memory entry card border |

#### Semantic

| Token | Hex | Usage |
|---|---|---|
| `color-success` | `#4A9E6A` | Connected provider dot, active status badge, streaming indicator, Claude model dot |
| `color-warning` | `#B8956A` | Reasoning token indicator, pending tool call, warning badge |
| `color-red` | `#C05C5C` | Destructive buttons, delete actions, error badge |
| `color-disabled` | `#3C3834` | Not-configured provider dot, inactive model dot |

#### Token breakdown colors

| Token type | Color |
|---|---|
| Prompt | `#3A5CA8` |
| Completion | `#4A9E6A` |
| Reasoning | `#B8956A` |
| Unused context | `#3C3834` |

---

### 1.2 Light Theme (reference only)

| Role | Hex |
|---|---|
| App background | `#F7F4EE` |
| Sidebar / panel bg | `#EDEAE2` |
| Hover / subtle fill | `#D9D5CB` |
| Border / divider | `#D2CEBC` |
| Primary text | `#1A1714` |
| Secondary text | `#7A7167` |
| Placeholder / disabled | `#A89F95` |
| Accent | `#2B4B8C` |
| Accent light bg | `#EBF0FA` |
| Accent light border | `#C5D3EF` |
| Success | `#4A9E6A` |
| Warning | `#B8956A` |

---

## 2. Typography

### 2.1 Font family

```
UI text:   system-ui, sans-serif   (San Francisco on macOS)
Monospace: 'Fira Code', monospace  (Session IDs, API keys, code, hex values)
Math:      STIX Two Math            (rendered math display only)
```

> **Important:** The dark theme uses `system-ui`, not `Inter`. The light theme used `Inter`. Do not mix them.

### 2.2 Type scale

| Name | Size | Weight | Letter-spacing | Usage |
|---|---|---|---|---|
| Display | 52px | 700 | `-0.04em` | Cover / hero (design guide only) |
| Section heading | 22px | 700 | `-0.03em` | Guide section titles |
| Session title | 18px | 700 | `-0.03em` | Chat toolbar session name |
| Page title | 16px | 700 | `-0.02em` | Panel headings (Session Manager topbar) |
| Sidebar title | 15px | 700 | `-0.02em` | "MathMate" app name in sidebar |
| Body | 14px | 400 | default | Chat message text, settings body content |
| Label | 13px | 400–600 | `-0.01em` | Sidebar session names, nav items, model rows, CTA button text |
| Caption | 12px | 400–500 | default | Provider status, metadata, description hints |
| Micro | 11px | 500–600 | `+0.07em` | All-caps section headers only |

### 2.3 Micro / section labels

Used throughout panels to introduce groups:

```css
font-size: 11px;
font-weight: 600;
color: #6E6860;
text-transform: uppercase;
letter-spacing: 0.07em;
```

Never use uppercase for body content or interactive labels.

### 2.4 Font weights in use

| Weight | Use |
|---|---|
| 700 Bold | Headings, app name, artboard section titles |
| 600 Semibold | Active tab text, section micro-labels, CTA text |
| 500 Medium | Selected session title, primary button text, model pill |
| 400 Regular | Body text, timestamps, captions, unselected nav |

---

## 3. Spacing

Base unit: **4px**. No strict grid — spacing chosen for visual grouping logic.

| Value | Usage |
|---|---|
| 2px | Icon-to-text in tight badge rows |
| 4px | Badge dot to label |
| 6px | Icon-to-label in nav rows, tab items |
| 8px | Between related elements in a row, row internal gap |
| 10px | Between message rows |
| 12px | Sidebar/toolbar internal padding, project header gap |
| 14px | Context panel section padding, memory entry card padding |
| 16px | Standard panel section horizontal padding |
| 20px | Detail panel padding, memory header padding |
| 24px | Between sections in overview / memory |
| 28px | Main content horizontal padding, session table row padding |
| 32px | Settings / overview content generous areas |
| 40px | Empty state center content |
| 48px | Design guide page top/bottom margin |

### Component-specific padding

| Component | Padding |
|---|---|
| Sidebar header | `20px 16px 12px 16px` |
| Project header row | `6px 16px 6px 12px` |
| Session row (sidebar) | `7px 12px 7px 10px` |
| Session table row | `0 28px` (height: 52px) |
| Tab bar item | `10px 16px 9px 16px` |
| Chat toolbar | `12px 20px` |
| Context panel sections | `14px 16px` |
| Memory entry card | `12px 14px` |
| Settings nav item | `8px 10px` |
| Model selector row | `8px 14px` |
| Detail panel | `16px 20px` |
| Design guide artboards | `48px 56px` |

---

## 4. Border Radius

| Value | Usage |
|---|---|
| 4px | Provider chip in model selector, token breakdown mini-bar |
| 6px | Session rows, icon buttons, tool status icon boxes, checkbox |
| 7px | Settings sidebar nav items, action buttons (rename/archive/delete) |
| 8px | Search inputs, memory entry cards, filter pill containers |
| 12px | Settings window, agent memory window, model selector popover, input bar card, chat user bubble |
| 20px | Filter pills, model selector toolbar pill (fully pill-shaped) |
| 50% | Status dots, avatar circles, toggle knob |

---

## 5. Core Components

### 5.1 Sidebar — project header row

```
Height: ~32px (6px top + bottom padding + content)
Chevron: 10×10px SVG, ▼ expanded / ▶ collapsed
Project name: 12px, 600, uppercase, #E8E3D9, letter-spacing 0.03em
⋯ menu: 13×13px, opacity 0.5 idle → 1.0 hover
Background: transparent idle, hover shows #2C2926
```

### 5.2 Session row — sidebar

**Default:**
- Background: transparent
- Left border: 2px transparent
- Title: 13px, 400, `#E8E3D9`
- Timestamp: 11px, `#7A7167`
- Icon: `#7A7167`

**Selected:**
- Background: `#2B4B8C`
- Left border: 2px `#5A7ED4`
- Title: 13px, 500, `#ffffff`
- Timestamp: 11px, `rgba(255,255,255,0.6)`
- Icon: `rgba(255,255,255,0.8)`

**Archived (italic, dimmed):**
- Title: 13px, 400, `#7A7167`, `font-style: italic`
- Timestamp: 11px, `#6E6860`

### 5.3 Tab bar

```
Height: ~40px
Bottom border: 1px #3C3834 (full width)
Active tab underline: 2px solid #5A7ED4, bottom-aligned
Active: text 13px weight 600, color #5A7ED4
Inactive: text 13px weight 400, color #7A7167
```

### 5.4 Buttons

**Primary CTA (`accent`):**
```css
background: #3A5CA8;
color: #ffffff;
border: none;
border-radius: 7px;
padding: 9px 18px;
font-size: 13px;
font-weight: 500;
```

**Secondary / outline:**
```css
background: transparent;
color: #E8E3D9;
border: 1px solid #3C3834;
border-radius: 7px;
padding: 8px 10px;
font-size: 12px;
```

**Destructive:**
```css
color: #C05C5C;
border: 1px solid rgba(192,92,92,0.3);
/* same radius/padding as secondary */
```

**New Project sidebar button:**
```css
background: #3A5CA8;
color: #ffffff;
border-radius: 8px;
padding: 9px 12px;
margin: 12px;
font-size: 13px;
font-weight: 500;
gap: 8px; /* icon + label */
```

### 5.5 Inputs & search

```css
background: #2C2926;
border: 1px solid #3C3834;
border-radius: 8px;
padding: 7px 12px;
font-size: 13px;
color: #E8E3D9;          /* entered text */
/* placeholder: */
color: #6E6860;
```

### 5.6 Filter pills

**Active:**
```css
background: #3A5CA8;
color: #ffffff;
font-weight: 500;
border-radius: 20px;
padding: 5px 14px;
```

**Inactive:**
```css
background: #2C2926;
border: 1px solid #3C3834;
color: #7A7167;
border-radius: 20px;
padding: 5px 14px;
```

### 5.7 Status badges (pill)

```css
border-radius: 10px;
padding: 2px 8px;
font-size: 11px;
font-weight: 500;
```

| State | Text color | Background |
|---|---|---|
| Active | `#4A9E6A` | `rgba(74,158,106,0.15)` |
| Archived | `#6E6860` | `rgba(110,104,96,0.15)` |
| Reasoning | `#B8956A` | `rgba(184,149,106,0.15)` |
| Error | `#C05C5C` | `rgba(192,92,92,0.15)` |

### 5.8 Model selector pill (toolbar)

```css
background: #2C2926;
border: 1px solid #3C3834;
border-radius: 20px;
padding: 6px 12px;
gap: 6px;
font-size: 12px;
font-weight: 500;
color: #E8E3D9;
/* provider dot: 6×6px circle */
```

Provider dot colors: `#4A9E6A` (Claude/Anthropic), `#7A7167` (other/unknown)

### 5.9 Memory entry cards

**Auto entry:**
```css
background: #2C2926;
border: 1px solid #3C3834;
border-radius: 8px;
padding: 12px 14px;
/* badge dot: #7A7167, label: 10px #7A7167 */
```

**Manual entry:**
```css
background: #2C2926;
border: 1px solid #2A4078;   /* accent-border — distinguishes manual */
border-radius: 8px;
padding: 12px 14px;
/* badge dot: #5A7ED4, label: 10px #5A7ED4 */
```

### 5.10 Toggle switch

```
Track: 36×20px, border-radius 10px
Knob: 14×14px white circle, 3px inset
ON:  track #3A5CA8, knob right
OFF: track #3C3834, knob left
```

### 5.11 Provider status dot

```
Size: 6×6px circle (toolbar pill) / 8×8px (settings header)
Connected: #4A9E6A
Not configured: #3C3834
```

---

## 6. Iconography

All icons are **inline SVG** — no icon library required.

### Conventions

| Property | Value |
|---|---|
| Stroke weight | 1.2–1.5px (scale with icon size) |
| Stroke cap | `round` always |
| Stroke join | `round` |
| Color | `currentColor` via `stroke="currentColor"` |
| Size range | 10–16px for UI icons; 9px for within-badge |

### Icon reference

| Icon | Description |
|---|---|
| Chat / session | Three horizontal lines (lengths: 10, 7, 8.5) |
| New / add | `+` (two perpendicular strokes) |
| Send | Up-arrow (vertical + angled cap) |
| Search | Circle (`r=4`) + diagonal handle |
| Settings gear | Small circle + 8 radial spokes |
| Chevron right | `▶` two strokes meeting at point |
| Chevron down | `▼` two strokes meeting at point |
| ⋯ menu | Three circles vertically stacked |
| Archive | Box with down-arrow entering it |
| Delete / trash | Bin (rect + handle + vertical strokes) |
| Rename / edit | Pencil body + nib triangle |
| Eye / open | Lens shape + inner circle |
| Restore | Circular arrow (RotateCcw) |
| Session Manager | Rounded rect outline + two horizontal lines |
| Open in Chat | Diagonal arrow (north-east) |
| Tool: success | Checkmark (two strokes) |
| Tool: pending | Clock (circle + two hands) |
| Tool: failure | Octagon + × |

---

## 7. Elevation & Shadows

MathMate is **flat-first**. Shadows only on floating surfaces.

| Surface | Shadow |
|---|---|
| App shell, panels | None — separated by `1px solid #3C3834` |
| Modal windows (Settings, Memory) | `box-shadow: 0 8px 40px rgba(0,0,0,0.18)` |
| Popovers (Model Selector) | `0 8px 32px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12)` |
| Scrim behind popover | `background: rgba(0,0,0,0.35)` |

---

## 8. Layout Grid

### 8.1 Main app shell

```
┌───────────┬──────────────────────────────────────┐
│  Sidebar  │  Main Panel                          │
│  240px    │  flex: 1                             │
│  fixed    │                                      │
└───────────┴──────────────────────────────────────┘
```

### 8.2 Main panel with context panel open

```
┌───────────┬──────────────────────────┬───────────┐
│  Sidebar  │  Chat / Vault / Overview  │  Context  │
│  240px    │  flex: 1                  │  272px    │
└───────────┴──────────────────────────┴───────────┘
```

### 8.3 Main panel vertical stack

```
┌─────────────────────────────────────────────────┐
│  Toolbar (title + model pill + actions)          │ ~57px
├─────────────────────────────────────────────────┤
│  Tab Bar (Chat · Vault · Overview)               │ ~40px
├─────────────────────────────────────────────────┤
│  Tab content (flex: 1, scrollable)               │
├─────────────────────────────────────────────────┤
│  Input bar (Chat tab only)                       │ ~68px
└─────────────────────────────────────────────────┘
```

### 8.4 Settings window

```
Window: 860 × 580px (fixed)
┌────────────┬──────────────────────────────┐
│  Settings  │  Section content             │
│  sidebar   │                              │
│  200px     │  flex: 1, padding 28px 32px  │
└────────────┴──────────────────────────────┘
```

### 8.5 Agent Memory window

```
Window: 860 × 640px (fixed)
┌──────────────────────────────────────────┐
│  Header (title + search + add)  28px pad │
├──────────────────────────────────────────┤
│  Stats / filter bar             10px pad │
├──────────────────────────────────────────┤
│  Grouped memory list (scrollable)        │
└──────────────────────────────────────────┘
```

### 8.6 Session Manager layout

```
┌───────────┬─────────────────────────────────┬──────────────┐
│  Sidebar  │  Session Table (flex: 1)         │  Detail Panel│
│  240px    │  ┌─ Topbar (57px) ─────────────┐ │  292px       │
│           │  │  title + search + filters    │ │              │
│           │  ├─ Column headers (36px) ──────┤ │  • metadata  │
│           │  │  scrollable rows (52px each) │ │  • preview   │
│           │  ├─ Bulk action bar (48px) ─────┤ │  • actions   │
│           │  └──────────────────────────────┘ │              │
└───────────┴─────────────────────────────────┴──────────────┘
```

---

## 9. Session Manager

The Session Manager is a dedicated view (accessible from the sidebar bottom nav) for browsing, searching, and bulk-managing all sessions across projects.

### 9.1 Topbar

- Title: 16px, 700, `#E8E3D9`
- Subtitle: 11px, `#6E6860`
- Search input: `bg-surface` + `color-border` border, 8px radius, 220px wide
- Filter pills: All / Active / Archived (pill component §5.6)
- Background: `bg-elevated` (`#1C1A18`)

### 9.2 Session table

**Column headers:** 36px height, `bg-app` background

| Column | Width | Token |
|---|---|---|
| Checkbox | 32px | — |
| Title | flex: 1 | `text-tertiary` uppercase label |
| Model | 130px | `text-tertiary` uppercase label |
| Messages | 100px | `text-tertiary` uppercase label |
| Updated | 120px | `text-tertiary` uppercase label |
| Status | 80px | `text-tertiary` uppercase label |
| Actions | 56px | — |

**Row height:** 52px  
**Row border-bottom:** `1px solid #2C2926`  
**Row hover:** `background: rgba(255,255,255,0.03)` (subtle)

**Selected row:**
```css
background: #2B4B8C;
border-left: 3px solid #5A7ED4;
/* all text uses white/rgba(255,255,255,x) */
```

**Archived row:**
```css
opacity: 0.55;
/* title italic, text-tertiary */
```

**Group dividers (project headers):**
```
padding: 14px 28px 6px
font: 11px 600 uppercase #6E6860
session count badge: bg #2C2926, radius 10px
```

### 9.3 Bulk action bar

Height: 48px · background: `bg-elevated` · border-top: `color-border`

- Selection count: 12px, 500, `#5A7ED4`
- Divider: `1px #3C3834`, 14px tall
- Bulk actions: Archive · Delete · Rename — 12px, `#7A7167`
- Right: total sessions count, 12px, `#6E6860`

### 9.4 Detail panel

Width: 292px · background: `bg-elevated` · border-left: `color-border`

**Header section** (padding 18px 20px 14px, border-bottom):
- Session title: 14px, 600, `#E8E3D9`
- Status badge (§5.7)
- "Open in Chat" CTA button (§5.4 Primary)

**Metadata section** (padding 16px 20px):

Each row: label 84px wide, `text-tertiary`, 11px 600 uppercase 0.06em tracking

| Field | Notes |
|---|---|
| Project | Project name |
| Model | Provider dot + model name |
| Provider | Provider string |
| Created | `MMM D, YYYY · h:mm A` |
| Updated | Relative (`Just now`, `2 days ago`) |
| Messages | Count + `(N user, N asst)` in tertiary |
| Tutor | Tutor style if set |
| Session ID | `Fira Code`, 11px, `#6E6860`, truncated |

**Last message preview:** `bg-surface` card, border `color-border`, 8px radius  
**Actions section:** Rename · Archive · Delete permanently (§5.4 Secondary/Destructive)

### 9.5 Sidebar nav entry

```css
/* Active state */
background: #2B4B8C;
color: #5A7ED4;
border-radius: 7px;
padding: 7px 10px;
font-size: 12px;

/* Inactive state */
background: transparent;
color: #7A7167;
```

---

## 10. Animation & Motion

Keep motion minimal. Target 15–20ms ease curves.

| Interaction | Animation |
|---|---|
| Project expand/collapse | `easeInOut 0.18s` |
| Context panel slide | `.move(edge: .trailing)` + `easeInOut 0.2s` |
| Model selector popover | Default platform popover |
| Toggle switch | `easeInOut 0.15s` on knob offset + track color |
| Tab switch | Instant content swap — no animation |
| Session selection | Immediate — no animation |
| Filter pill switch | Instant |

---

## 11. UI Copy Style

- **Section labels:** ALL CAPS, 1–2 words max. `MESSAGES` not `Message Count`.
- **CTA buttons:** verb-first. "Open in Chat", "New session", "Archive session".
- **Empty states:** warm but brief. Max two sentences.
- **Status text:** factual, no filler. "Active" not "This session is currently active".
- **Hint text / captions:** lowercase sentence case. `sess_a4f8c1…` for truncated IDs.
- **Timestamps:** relative for ≤7 days (`Just now`, `Today`, `Yesterday`, `3 days ago`), absolute for older (`May 16`).
- **Destructive confirmations:** always end with `…` to indicate a dialog follows. "Delete permanently…"
- **Disclaimer (input bar):** "MathMate can make mistakes. Verify important results." — 10px, `#6E6860`, centered.

---

## 12. States to Handle

| State | Behaviour |
|---|---|
| No projects | `EmptyStateView` — welcome copy + New Project CTA |
| Project exists, no session | "Select or start a session" prompt in main panel |
| Session loading | Progress indicator in message area |
| Model streaming | Streaming bubble + thinking indicator |
| Context panel open | 272px right column; toggle icon gets `bg-surface` fill |
| Provider disabled | Section dimmed to 45% opacity; models absent from selector |
| Provider enabled, no key | Models dimmed in selector; "no key set" note shown |
| Memory extraction | Silent background; no UI change |
| Overview summary generating | "Generating…" replaces summary text |
| Session Manager — none selected | Detail panel shows "Select a session" empty state |
| Session Manager — 1+ selected | Bulk action bar activates with count + actions |
| Session Manager — archived row | Row at 55% opacity, italic title, restore icon in actions |
| Session Manager — search active | Table filters to matching rows; group headers persist if any match |

---

*Created: 2026-05-19 · Updated: 2026-05-30 (dark theme tokens, Session Manager, Paper guide page)*
