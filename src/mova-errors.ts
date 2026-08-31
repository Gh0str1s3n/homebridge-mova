import axios from 'axios';
import type { MovaRegionSettings } from './mova-region.js';

export type MovaCloudOperation = 'login' | 'device-list' | 'device-command'
  | 'map-url' | 'map-download';

const ERROR_CODES = new Set([
  'invalid_user', 'invalid_grant', 'invalid_client', 'invalid_request',
  'unauthorized', 'access_denied', 'invalid_token', 'token_expired',
  'unsupported_grant_type', 'invalid_scope', 'server_error',
  'temporarily_unavailable', 'limit_attempts_unauthorized',
]);
const ERROR_MESSAGES = new Set([
  'username or password error', 'user password not match',
  'invalid username or password', 'invalid credentials',
  'unauthorized', 'forbidden', 'access denied', 'invalid token',
  'token expired', 'invalid grant', 'too many requests',
  'account locked', 'account does not exist', 'user not found',
]);
const NETWORK_CODES = new Set([
  'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED',
  'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ERR_NETWORK',
  'ERR_BAD_REQUEST', 'ERR_BAD_RESPONSE', 'ERR_CANCELED',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

type SafeFields = Record<string, string | number | boolean>;

function safeCode(value: unknown): string | number {
  if (typeof value === 'number' && Number.isInteger(value)
    && value >= -2147483648 && value <= 2147483647) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (ERROR_CODES.has(normalized)) {
      return normalized;
    }
    if (/^-?\d{1,10}$/.test(normalized)) {
      return safeCode(Number(normalized));
    }
  }
  return '[redacted]';
}

// Rebuild from a small allowlist; never redact a copy of the original response.
// Even an innocently named `message` can echo an email, token or signed URL.
export function sanitizeMovaApiError(body: unknown): SafeFields {
  if (typeof body === 'string') {
    if (body.length > 16_384) {
      return {};
    }
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      return {};
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  const source = body as Record<string, unknown>;
  const result: SafeFields = {};
  for (const field of ['code', 'error']) {
    if (source[field] !== undefined) {
      result[field] = safeCode(source[field]);
    }
  }
  for (const field of ['error_description', 'msg', 'message']) {
    if (source[field] === undefined) {
      continue;
    }
    const value = typeof source[field] === 'string'
      ? source[field].trim().toLowerCase()
      : '';
    result[field] = ERROR_MESSAGES.has(value) ? value : '[redacted]';
  }
  for (const field of ['maxAttempts', 'remains']) {
    const value = source[field];
    if ((typeof value === 'number' || typeof value === 'string')
      && /^\d{1,2}$/.test(String(value))) {
      result[field] = Number(value);
    }
  }
  if (typeof source.success === 'boolean') {
    result.success = source.success;
  }
  return result;
}

export class MovaCloudError extends Error {
  readonly diagnostic: Readonly<Record<string, unknown>>;

  constructor(
    description: string,
    operation: MovaCloudOperation,
    settings: MovaRegionSettings,
    details: { error?: unknown; body?: unknown; resultCode?: unknown } = {},
  ) {
    const error = axios.isAxiosError(details.error) ? details.error : undefined;
    const status = error?.response?.status;
    const networkCode = error?.code;
    const diagnostic: Record<string, unknown> = {
      operation,
      region: settings.region,
      country: settings.country,
      language: settings.language,
      rlcLanguage: settings.rlcLanguage,
    };
    if (Number.isInteger(status) && status! >= 100 && status! <= 599) {
      diagnostic.httpStatus = status;
    }
    if (networkCode && NETWORK_CODES.has(networkCode)) {
      diagnostic.networkCode = networkCode;
    }
    const api = sanitizeMovaApiError(details.body ?? error?.response?.data);
    if (Object.keys(api).length) {
      diagnostic.api = Object.freeze(api);
    }
    if (details.resultCode !== undefined) {
      diagnostic.resultCode = safeCode(details.resultCode);
    }
    const hint = operation === 'login'
      ? ' Check the MOVAhome account region/country and credentials. '
        + 'A region-specific authentication flow may also be required; avoid repeated login attempts.'
      : '';
    super(`${description}${hint} MOVA cloud diagnostic: ${JSON.stringify(diagnostic)}`);
    this.name = 'MovaCloudError';
    this.diagnostic = Object.freeze(diagnostic);
    // Do not keep the Axios error as `cause`: it contains the request credentials.
  }
}
