import * as vscode from 'vscode';

const GLOBAL_KEY = 'all-in-copilot.apiKey';
const PROVIDER_PREFIX = 'all-in-copilot.apiKey.';

export class AuthManager {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getApiKey(provider?: string): Promise<string | undefined> {
    for (const candidate of getProviderKeyCandidates(provider)) {
      const providerKey = await this.secrets.get(`${PROVIDER_PREFIX}${candidate}`);
      if (providerKey) {
        return providerKey;
      }
    }

    return this.secrets.get(GLOBAL_KEY);
  }

  async hasAnyApiKey(providers: readonly string[]): Promise<boolean> {
    if (await this.secrets.get(GLOBAL_KEY)) {
      return true;
    }

    for (const provider of providers) {
      for (const candidate of getProviderKeyCandidates(provider)) {
        if (await this.secrets.get(`${PROVIDER_PREFIX}${candidate}`)) {
          return true;
        }
      }
    }

    return false;
  }

  async promptForGlobalApiKey(): Promise<boolean> {
    const existing = await this.secrets.get(GLOBAL_KEY);
    const apiKey = await vscode.window.showInputBox({
      title: 'All in Copilot API Key',
      prompt: existing ? 'Update the default API key' : 'Enter the default API key',
      ignoreFocusOut: true,
      password: true,
      value: existing ?? '',
    });

    if (apiKey === undefined) {
      return false;
    }

    if (!apiKey.trim()) {
      await this.secrets.delete(GLOBAL_KEY);
      vscode.window.showInformationMessage('All in Copilot default API key cleared.');
      return true;
    }

    await this.secrets.store(GLOBAL_KEY, apiKey.trim());
    vscode.window.showInformationMessage('All in Copilot default API key saved.');
    return true;
  }

  async promptForProviderApiKey(provider: string): Promise<boolean> {
    const normalizedProvider = provider.toLowerCase();
    const key = `${PROVIDER_PREFIX}${normalizedProvider}`;
    const existing = await this.secrets.get(key);
    const apiKey = await vscode.window.showInputBox({
      title: `All in Copilot API Key: ${provider}`,
      prompt: existing ? `Update API key for ${provider}` : `Enter API key for ${provider}`,
      ignoreFocusOut: true,
      password: true,
      value: existing ?? '',
    });

    if (apiKey === undefined) {
      return false;
    }

    if (!apiKey.trim()) {
      await this.secrets.delete(key);
      vscode.window.showInformationMessage(`All in Copilot API key for ${provider} cleared.`);
      return true;
    }

    await this.secrets.store(key, apiKey.trim());
    vscode.window.showInformationMessage(`All in Copilot API key for ${provider} saved.`);
    return true;
  }

  async storeProviderApiKey(provider: string, apiKey: string): Promise<void> {
    await this.secrets.store(`${PROVIDER_PREFIX}${provider.toLowerCase()}`, apiKey.trim());
  }

  async clearGlobalApiKey(): Promise<void> {
    await this.secrets.delete(GLOBAL_KEY);
  }
}

function getProviderKeyCandidates(provider: string | undefined): string[] {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const aliases = new Set([normalized]);
  if (normalized !== 'custom' && normalized !== 'openai' && normalized !== 'anthropic') {
    aliases.add('custom');
  }
  if (normalized.startsWith('custom-')) {
    aliases.add('custom');
  }
  return Array.from(aliases);
}
