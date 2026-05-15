import * as vscode from 'vscode';
import { getDebugLoggingEnabled } from './config';

class Logger {
  private readonly output = vscode.window.createOutputChannel('All in Copilot');

  info(message: string, data?: unknown): void {
    this.write('INFO', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.write('WARN', message, data);
  }

  error(message: string, data?: unknown): void {
    this.write('ERROR', message, data);
  }

  debug(message: string, data?: unknown): void {
    if (getDebugLoggingEnabled()) {
      this.write('DEBUG', message, data);
    }
  }

  show(): void {
    this.output.show();
  }

  dispose(): void {
    this.output.dispose();
  }

  private write(level: string, message: string, data?: unknown): void {
    const suffix = data === undefined ? '' : ` ${safeJson(data)}`;
    this.output.appendLine(`[${new Date().toISOString()}] [${level}] ${message}${suffix}`);
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = new Logger();
