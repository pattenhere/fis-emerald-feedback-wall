export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export const createHttpError = (statusCode, message) => new HttpError(statusCode, message);

const getClientAddress = (request) => {
  const forwarded = String(request.headers?.["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  return forwarded || request.socket?.remoteAddress || "unknown";
};

export const createRateLimiter = () => {
  const buckets = new Map();

  return ({ request, bucket, max, windowMs }) => {
    const now = Date.now();
    const key = `${bucket}:${getClientAddress(request)}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= max) {
      throw createHttpError(429, "Too many requests. Please try again shortly.");
    }
    current.count += 1;
    buckets.set(key, current);
  };
};

export const createJsonBodyReader = (defaultMaxBytes) => {
  return async (request, { maxBytes = defaultMaxBytes } = {}) => {
    const contentLength = Number(request.headers?.["content-length"] ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw createHttpError(413, `Payload too large. Max allowed body is ${maxBytes} bytes.`);
    }

    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of request) {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        throw createHttpError(413, `Payload too large. Max allowed body is ${maxBytes} bytes.`);
      }
      chunks.push(chunk);
    }

    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw createHttpError(400, "Malformed JSON payload.");
    }
  };
};

export const toTrimmedString = (value, fallback = "") => String(value ?? fallback).trim();

export const toOptionalString = (value, maxLength = 1000) => {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > maxLength) {
    throw createHttpError(400, `Value exceeds max length (${maxLength}).`);
  }
  return text;
};

export const toRequiredString = (value, { field, maxLength = 1000 }) => {
  const text = toOptionalString(value, maxLength);
  if (!text) {
    throw createHttpError(400, `${field} is required.`);
  }
  return text;
};

export const toOptionalInt = (value, { field, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) => {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw createHttpError(400, `${field ?? "value"} must be a number.`);
  }
  const normalized = Math.floor(numeric);
  if (normalized < min || normalized > max) {
    throw createHttpError(400, `${field ?? "value"} is out of range.`);
  }
  return normalized;
};

export const toOptionalIso = (value, field) => {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw createHttpError(400, `${field} must be a valid timestamp.`);
  }
  return date.toISOString();
};
