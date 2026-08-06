import { useLocation, useNavigate } from "react-router-dom";

// Routes where the tab bar should not appear
const HIDDEN_ROUTES = ["/settings"];

const tabs = [
  {
    path: "/chat",
    label: "Chat",
    icon: (active: boolean) => (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path
          d="M2 2h9a1 1 0 011 1v5a1 1 0 01-1 1H5L2 12V3a1 1 0 010 0z"
          stroke={active ? "var(--color-accent-light)" : "var(--color-text-tertiary)"}
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    path: "/vault",
    label: "Vault",
    icon: (active: boolean) => (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <rect
          x="2" y="1.5" width="9" height="10" rx="1.5"
          stroke={active ? "var(--color-accent-light)" : "var(--color-text-tertiary)"}
          strokeWidth="1.1"
        />
        <path
          d="M4.5 4.5h4M4.5 6.5h4M4.5 8.5h2.5"
          stroke={active ? "var(--color-accent-light)" : "var(--color-text-tertiary)"}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    path: "/book",
    label: "Book",
    icon: (active: boolean) => (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path
          d="M3 1.5h7a.5.5 0 01.5.5v9a.5.5 0 01-.5.5H3a1 1 0 01-1-1V2.5a1 1 0 011-1z"
          stroke={active ? "var(--color-accent-light)" : "var(--color-text-tertiary)"}
          strokeWidth="1.1"
        />
        <path
          d="M3.5 4h1.5M3.5 5.5h2.5M3.5 7h1"
          stroke={active ? "var(--color-accent-light)" : "var(--color-text-tertiary)"}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    path: "/library",
    label: "Library",
    icon: (active: boolean) => (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path
          d="M1.5 2v9M4 2v9M6.5 2v9M9.5 2.5l2 8.5"
          stroke={active ? "var(--color-accent-light)" : "var(--color-text-tertiary)"}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    path: "/overview",
    label: "Overview",
    icon: (active: boolean) => (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <circle
          cx="6.5" cy="6.5" r="4.5"
          stroke={active ? "var(--color-accent-light)" : "var(--color-text-tertiary)"}
          strokeWidth="1.1"
        />
        <path
          d="M6.5 4v2.5l1.5 1.5"
          stroke={active ? "var(--color-accent-light)" : "var(--color-text-tertiary)"}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  if (HIDDEN_ROUTES.includes(location.pathname)) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        padding: "0 20px",
        background: "var(--color-bg-elevated)",
        borderBottom: "1px solid var(--color-border)",
        flexShrink: 0,
      }}
    >
      {tabs.map((tab) => {
        const active =
          tab.path === "/chat"
            ? location.pathname.startsWith("/chat")
            : location.pathname === tab.path;

        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 16px 9px",
              gap: 6,
              border: "none",
              borderBottom: active
                ? "2px solid var(--color-accent-light)"
                : "2px solid transparent",
              background: "transparent",
              color: active ? "var(--color-accent-light)" : "var(--color-text-secondary)",
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
              letterSpacing: "-0.01em",
              lineHeight: 1,
              transition: "color 0.1s",
            }}
          >
            {tab.icon(active)}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
