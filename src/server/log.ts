// One line per event as key=value pairs. See docs/logging.md.

const FORBIDDEN = /password|hash|cookie|token/i;

export type Fields = Record<string, string | number | boolean | undefined>;

function formatValue(value: string | number | boolean): string {
  const text = String(value);
  return /[\s"=]/.test(text) || text === "" ? `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : text;
}

export function formatEvent(event: string, fields: Fields, machine: string | undefined): string {
  const parts = [`event=${event}`, `machine=${machine || "local"}`];
  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN.test(key)) throw new Error(`forbidden log field: ${key}`);
    if (value !== undefined) parts.push(`${key}=${formatValue(value)}`);
  }
  return parts.join(" ");
}

export function logEvent(event: string, fields: Fields = {}): void {
  console.log(formatEvent(event, fields, process.env.FLY_MACHINE_ID));
}
