// Regional server identifiers also used by F1nn-T/dreame-ha's MOVA config flow.
// Only EU/DE has been hardware-tested with this plugin. Never probe other
// regions automatically: failed logins can lock a MOVA account.
export const MOVA_REGIONS = ['eu', 'us', 'sg', 'cn', 'ru'] as const;
export type MovaRegion = typeof MOVA_REGIONS[number];

export const MOVA_LANGUAGES = ['auto', 'en', 'de', 'fr'] as const;

export interface MovaRegionOptions {
  region?: unknown;
  country?: unknown;
  language?: unknown;
}

export interface MovaRegionSettings {
  readonly region: MovaRegion;
  readonly country: string;
  readonly language: string;
  readonly rlcLanguage: string;
  readonly domain: string;
}

export class MovaConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MovaConfigurationError';
  }
}

function option(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new MovaConfigurationError(`MOVA ${field}: expected a text value.`);
  }
  return value.trim() || undefined;
}

export function resolveMovaRegion(
  options: MovaRegionOptions = {},
): MovaRegionSettings {
  const region = option(options.region, 'region')?.toLowerCase() ?? 'eu';
  if (!MOVA_REGIONS.includes(region as MovaRegion)) {
    throw new MovaConfigurationError('MOVA region must be eu, us, sg, cn or ru.');
  }

  const configuredCountry = option(options.country, 'country')?.toUpperCase();
  if (!configuredCountry && region !== 'eu') {
    throw new MovaConfigurationError(
      'Set MOVA account country when using a non-EU region (for example CA for Canada).',
    );
  }
  const country = configuredCountry ?? 'DE';
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new MovaConfigurationError('MOVA country must be a two-letter account country code.');
  }

  const configuredLanguage = option(options.language, 'language')?.toLowerCase() ?? 'auto';
  if (!(MOVA_LANGUAGES as readonly string[]).includes(configuredLanguage)) {
    throw new MovaConfigurationError('MOVA language must be auto, en, de or fr.');
  }
  const legacyDefaults = region === 'eu' && country === 'DE';
  const language = configuredLanguage === 'auto'
    ? (legacyDefaults ? 'de' : 'en')
    : configuredLanguage;

  return Object.freeze({
    region: region as MovaRegion,
    country,
    language,
    // The working EU/DE client historically sends de in forms but en in RLC.
    rlcLanguage: configuredLanguage === 'auto' ? 'en' : language,
    domain: `${region}.iot.mova-tech.com:13267`,
  });
}
