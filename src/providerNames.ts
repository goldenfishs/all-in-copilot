export function resolveProviderName(provider: string | undefined, baseUrl: string | undefined): string | undefined {
  const configured = provider?.trim();
  if (configured) {
    return normalizeProviderName(configured);
  }

  return inferProviderFromBaseUrl(baseUrl || '');
}

export function inferProviderFromBaseUrl(baseUrl: string): string | undefined {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    if (hostname === 'api.openai.com') {
      return 'openai';
    }
    if (hostname === 'api.anthropic.com') {
      return 'anthropic';
    }

    const parts = hostname.split('.').filter(Boolean);
    const provider = parts.length >= 2 ? parts.at(-2) : parts[0];
    return normalizeProviderName(provider);
  } catch {
    return undefined;
  }
}

export function normalizeProviderName(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === 'xtokenmirror') {
    return 'xtoken';
  }

  if (normalized === 'moonshot') {
    return 'kimi';
  }

  if (normalized === 'minimaxi') {
    return 'minimax';
  }

  return normalized;
}
