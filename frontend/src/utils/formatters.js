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

export { formatBytes, formatDateTime };
