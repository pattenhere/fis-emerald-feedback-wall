import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/profile-switcher.css";

export type ProfileRole = "attendee" | "greeter" | "facilitator";

interface ProfileOption {
  role: ProfileRole;
  label: string;
  path: string;
}

interface ProfileSwitcherProps {
  currentRole: ProfileRole;
  compact?: boolean;
  className?: string;
  display?: "full" | "initial";
}

const OPTIONS: ProfileOption[] = [
  { role: "attendee", label: "Attendee", path: "/" },
  { role: "greeter", label: "Greeter", path: "/greeter" },
  { role: "facilitator", label: "Facilitator", path: "/facilitator/overview" },
];

export const ProfileSwitcher = ({
  currentRole,
  compact = false,
  className = "",
  display = "full",
}: ProfileSwitcherProps): JSX.Element => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = useMemo(
    () => OPTIONS.find((option) => option.role === currentRole) ?? OPTIONS[0],
    [currentRole],
  );
  const activeInitial = useMemo(() => active.label.slice(0, 1).toUpperCase(), [active.label]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current) return;
      const target = event.target;
      if (target instanceof Node && rootRef.current.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div className={`profile-switcher ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={`profile-switcher-trigger${compact ? " is-compact" : ""}${display === "initial" ? " is-initial" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        title={`Current profile: ${active.label}`}
      >
        {display === "initial" ? (
          <span className="profile-switcher-initial" aria-hidden="true">{activeInitial}</span>
        ) : (
          <>
            <span className="profile-switcher-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 12.6a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Z" />
                <path d="M4.8 19.8c1.6-2.9 4.4-4.2 7.2-4.2s5.6 1.3 7.2 4.2" />
              </svg>
            </span>
            <span className="profile-switcher-label">{active.label}</span>
            <span className="profile-switcher-caret" aria-hidden="true">▾</span>
          </>
        )}
      </button>
      {open && (
        <div className="profile-switcher-menu" role="menu" aria-label="Switch profile">
          {OPTIONS.map((option) => (
            <button
              key={option.role}
              type="button"
              className={`profile-switcher-item${option.role === currentRole ? " is-active" : ""}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (window.location.pathname === option.path) return;
                window.location.assign(option.path);
              }}
            >
              <span>{option.label}</span>
              {option.role === currentRole ? <span aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
