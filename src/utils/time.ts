export const formatCountdown = (targetIso: string): string => {
  const diffMs = new Date(targetIso).getTime() - Date.now();
  if (diffMs <= 0) {
    return "00:00:00";
  }

  const totalSec = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSec % 60).toString().padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
};
