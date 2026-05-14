export interface ConvertSchemaPart {
  type?: string | string[];
  format?: string;
  [key: string]: unknown;
}

export class ConversionError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = "ConversionError";
  }
}

const FORBIDDEN_CAPTURE_TYPES = new Set(["array", "object", "null"]);

const DATE_YYYYMMDD = /^\d{8}$/;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function convertCaptureValue(
  field: string,
  raw: string,
  def: ConvertSchemaPart | undefined,
): unknown {
  const t = def?.type;
  const typeStr = Array.isArray(t) ? t[0] : t;

  if (typeStr && FORBIDDEN_CAPTURE_TYPES.has(typeStr)) {
    throw new ConversionError(
      field,
      `配置错误：捕获组字段不允许声明 type: "${typeStr}"（捕获组天然是字符串）`,
    );
  }

  if (typeStr === undefined || typeStr === "string") {
    if (def?.format === "date") return normalizeDate(field, raw);
    return raw;
  }

  if (typeStr === "integer" || typeStr === "number") {
    const n = Number(raw);
    if (Number.isNaN(n)) {
      throw new ConversionError(field, `无法将 "${raw}" 转换为 ${typeStr}`);
    }
    if (typeStr === "integer" && !Number.isInteger(n)) {
      throw new ConversionError(field, `"${raw}" 不是合法的 integer`);
    }
    return n;
  }

  if (typeStr === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw new ConversionError(field, `无法将 "${raw}" 转换为 boolean（仅接受 "true"/"false"）`);
  }

  return raw;
}

function normalizeDate(field: string, raw: string): string {
  if (DATE_ISO.test(raw)) return raw;
  if (DATE_YYYYMMDD.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  throw new ConversionError(
    field,
    `"${raw}" 不符合 YYYYMMDD 或 YYYY-MM-DD 日期格式`,
  );
}
