let initialized = false;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

// Ctrl + Shift + M => open Emerald Gantt in a new tab.
export function initGanttShortcut(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("keydown", (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (!event.shiftKey || key !== "m") return;
    if (!event.ctrlKey || event.metaKey) return;

    event.preventDefault();
    window.open("/assets/fis-emerald-gantt.html", "_blank", "noopener,noreferrer");
  });
}
