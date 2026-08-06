import type { TextbookLicense, TextbookLicenseInfo, TextbookCatalogEntry } from "../lib/types";

export const LICENSE_INFO: Record<TextbookLicense, TextbookLicenseInfo> = {
  "cc-by": {
    license: "cc-by",
    label: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    attribution_required: true,
    description: "Creative Commons Attribution — can be adapted with credit",
  },
  "cc-by-sa": {
    license: "cc-by-sa",
    label: "CC BY-SA 4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution_required: true,
    description: "Creative Commons Attribution-ShareAlike — adaptations must share alike",
  },
  "cc-by-nc": {
    license: "cc-by-nc",
    label: "CC BY-NC 4.0",
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
    attribution_required: true,
    description: "Creative Commons Attribution-NonCommercial — non-commercial use only",
  },
  "cc-by-nc-sa": {
    license: "cc-by-nc-sa",
    label: "CC BY-NC-SA 4.0",
    url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    attribution_required: true,
    description: "Creative Commons Attribution-NonCommercial-ShareAlike",
  },
  "cc-by-nd": {
    license: "cc-by-nd",
    label: "CC BY-ND 4.0",
    url: "https://creativecommons.org/licenses/by-nd/4.0/",
    attribution_required: true,
    description: "Creative Commons Attribution-NoDerivatives — no modifications",
  },
  "cc-by-nc-nd": {
    license: "cc-by-nc-nd",
    label: "CC BY-NC-ND 4.0",
    url: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    attribution_required: true,
    description: "Creative Commons Attribution-NonCommercial-NoDerivatives — free sharing, no modifications, non-commercial only",
  },
  "gpl": {
    license: "gpl",
    label: "GNU GPL",
    url: "https://www.gnu.org/licenses/gpl-3.0.html",
    attribution_required: true,
    description: "GNU General Public License — derivative works must share alike",
  },
  "mit": {
    license: "mit",
    label: "MIT License",
    url: "https://opensource.org/licenses/MIT",
    attribution_required: true,
    description: "MIT License — minimal restrictions, attribution required",
  },
  "free-online": {
    license: "free-online",
    label: "Free Online Access",
    url: undefined,
    attribution_required: true,
    description:
      "Freely available online with attribution requirements — check source for details",
  },
  "other": {
    license: "other",
    label: "Other Open License",
    url: undefined,
    attribution_required: true,
    description:
      "Open access — check source for specific licensing terms and attribution requirements",
  },
};

const SUBJECT_LABELS: Record<string, string> = {
  algebra: "Algebra",
  calculus: "Calculus",
  statistics: "Statistics",
  "linear-algebra": "Linear Algebra",
  "differential-equations": "Differential Equations",
  geometry: "Geometry",
  trigonometry: "Trigonometry",
  "discrete-math": "Discrete Math",
  probability: "Probability",
  physics: "Physics",
  "number-theory": "Number Theory",
  "olympiad-general": "Olympiad — General",
  "olympiad-geometry": "Olympiad — Geometry",
  "olympiad-algebra": "Olympiad — Algebra",
  "olympiad-number-theory": "Olympiad — Number Theory",
  "olympiad-combinatorics": "Olympiad — Combinatorics",
  "abstract-algebra": "Abstract Algebra",
  "real-analysis": "Real Analysis",
  other: "Other",
};

export function subjectLabel(subject: string): string {
  return SUBJECT_LABELS[subject] ?? subject;
}

const SUBJECT_COLORS: Record<string, string> = {
  algebra: "rgb(59,130,246)",
  calculus: "rgb(239,68,68)",
  statistics: "rgb(34,197,94)",
  "linear-algebra": "rgb(168,85,247)",
  "differential-equations": "rgb(234,179,8)",
  geometry: "rgb(34,211,238)",
  trigonometry: "rgb(249,115,22)",
  "discrete-math": "rgb(20,184,166)",
  probability: "rgb(236,72,153)",
  physics: "rgb(99,102,241)",
  "number-theory": "rgb(234,88,12)",
  "olympiad-general": "rgb(124,58,237)",
  "olympiad-geometry": "rgb(8,145,178)",
  "olympiad-algebra": "rgb(5,150,105)",
  "olympiad-number-theory": "rgb(217,119,6)",
  "olympiad-combinatorics": "rgb(220,38,38)",
  "abstract-algebra": "rgb(14,165,233)",
  "real-analysis": "rgb(244,63,94)",
  other: "rgb(148,163,184)",
};

export function subjectColor(subject: string): string {
  return SUBJECT_COLORS[subject] ?? "rgb(148,163,184)";
}

export function buildAttributionNotice(entry: TextbookCatalogEntry): string {
  const authors = entry.authors.join(", ");
  const info = LICENSE_INFO[entry.license];
  const urlPart = info?.url ? ` (${info.url})` : "";
  return `Source: ${entry.title} by ${authors} (${info?.label ?? entry.license}).${urlPart}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}