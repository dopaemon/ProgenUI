function formatBytes(byteCount) {
  if (!byteCount) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let currentValue = Number(byteCount);
  let unitIndex = 0;

  while (currentValue >= 1024 && unitIndex < units.length - 1) {
    currentValue /= 1024;
    unitIndex += 1;
  }

  return `${currentValue.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatDateTime(dateValue) {
  if (!dateValue) {
    return "Never";
  }

  return new Date(dateValue).toLocaleString();
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "0%";
  }

  return `${Number(value).toFixed(1)}%`;
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const dayCount = Math.floor(safeSeconds / 86400);
  const hourCount = Math.floor((safeSeconds % 86400) / 3600);
  const minuteCount = Math.floor((safeSeconds % 3600) / 60);

  const parts = [];
  if (dayCount > 0) {
    parts.push(`${dayCount}d`);
  }
  if (hourCount > 0 || parts.length > 0) {
    parts.push(`${hourCount}h`);
  }
  parts.push(`${minuteCount}m`);
  return parts.join(" ");
}

export { formatBytes, formatDateTime, formatDuration, formatPercent };
