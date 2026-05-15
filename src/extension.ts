import * as vscode from 'vscode';
import { AuthManager } from './auth';
import { getProviderKeys } from './config';
import { logger } from './logger';
import { ModelManagerViewProvider } from './modelView';
import { AllInCopilotProvider } from './provider';

let activeProvider: AllInCopilotProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.info(`Activating All in Copilot ${context.extension.packageJSON.version}`);

  const authManager = new AuthManager(context.secrets);
  const provider = new AllInCopilotProvider(authManager, context);
  const modelViewProvider = new ModelManagerViewProvider(
    context,
    authManager,
    () => {
      void provider.refreshModelPicker();
    },
  );
  activeProvider = provider;

  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider('allin', provider),
    vscode.window.registerWebviewViewProvider(ModelManagerViewProvider.viewType, modelViewProvider, {
      webviewOptions: {
        retainContextWhenHidden: false,
      },
    }),
    vscode.commands.registerCommand('all-in-copilot.focusModels', () => {
      modelViewProvider.focus();
    }),
    vscode.commands.registerCommand('all-in-copilot.setApiKey', async () => {
      if (await authManager.promptForGlobalApiKey()) {
        void provider.refreshModelPicker();
        modelViewProvider.postState();
      }
    }),
    vscode.commands.registerCommand('all-in-copilot.setProviderApiKey', async () => {
      const providers = getProviderKeys();
      if (providers.length === 0) {
        vscode.window.showWarningMessage('No All in Copilot providers are configured.');
        return;
      }

      const selected = await vscode.window.showQuickPick(providers, {
        title: 'All in Copilot Provider',
        placeHolder: 'Choose the provider to configure',
      });
      if (!selected) {
        return;
      }

      if (await authManager.promptForProviderApiKey(selected)) {
        void provider.refreshModelPicker();
        modelViewProvider.postState();
      }
    }),
    vscode.commands.registerCommand('all-in-copilot.clearApiKey', async () => {
      await authManager.clearGlobalApiKey();
      void provider.refreshModelPicker();
      vscode.window.showInformationMessage('All in Copilot default API key cleared.');
    }),
    vscode.commands.registerCommand('all-in-copilot.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'all-in-copilot');
    }),
    vscode.commands.registerCommand('all-in-copilot.showLogs', () => logger.show()),
  );

  try {
    await vscode.extensions.getExtension('github.copilot-chat')?.activate();
  } catch (error) {
    logger.warn('Could not activate GitHub Copilot Chat before refreshing models.', formatError(error));
  }

  void provider.refreshModelPicker();
  logger.info('All in Copilot activated.');
}

export async function deactivate(): Promise<void> {
  try {
    await activeProvider?.prepareForDeactivate();
  } finally {
    activeProvider = undefined;
    logger.info('All in Copilot deactivated.');
    logger.dispose();
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
