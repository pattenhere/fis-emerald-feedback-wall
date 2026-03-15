export const formatCountdown = (targetIso: string): string => {
  const diffMs = new Date(targetIso).getTime() - Date.now();
  if (diffMs <= 0) {
    return "00:00";
  }

  const totalSec = Math.max(0, Math.ceil(diffMs / 1000));
  const minutes = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSec % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
};

export const formatDurationMmSs = (totalSecondsInput: number): string => {
  const totalSeconds = Math.max(0, Math.floor(Number(totalSecondsInput) || 0));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};
