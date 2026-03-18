declare const process: {
  env: Record<string, string | undefined>;
};

export const UI_VARIANT = process.env.EMERALD_UI_VARIANT ?? "legacy";
export const FEEDBACK_PANEL_STAY_OPEN = process.env.EMERALD_FEEDBACK_PANEL_STAY_OPEN === "true";
