import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { getModelByRegisteredId } from './config';
import { logger } from './logger';
import type { ResolvedModelConfig } from './types';

const IMAGE_DESCRIPTION_PROMPT =
  'Describe the visual contents of this image in detail, including any text, objects, people, UI elements, code, diagrams, or context relevant to answering the user. Be factual and concise.';
const IMAGE_DESCRIPTION_UNAVAILABLE = '[Image Description unavailable]';
const IMAGE_DESCRIPTION_PREFIX = '[Image Description: ';
const IMAGE_DESCRIPTION_SUFFIX = ']';

const descriptionCache = new Map<string, string>();
const pendingDescriptions = new Map<string, Promise<string>>();
let cachedVisionModel: vscode.LanguageModelChat | undefined;
let cachedVisionModelPromise: Promise<vscode.LanguageModelChat | undefined> | undefined;

export interface VisionResolution {
  messages: readonly vscode.LanguageModelChatRequestMessage[];
  describedImages: number;
  unavailableImages: number;
  visionModelId?: string;
}

export async function resolveImagesForTextModel(
  model: ResolvedModelConfig,
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  token: vscode.CancellationToken,
): Promise<VisionResolution> {
  if (model.vision || !messages.some((message) => message.content.some(isImageDataPart))) {
    return { messages, describedImages: 0, unavailableImages: 0 };
  }

  const visionModel = await getVisionModel(model);
  if (!visionModel) {
    logger.warn('No vision-capable model found; image attachments will be replaced with an unavailable marker.');
  }

  let describedImages = 0;
  let unavailableImages = 0;
  const resolvedMessages: vscode.LanguageModelChatRequestMessage[] = [];

  for (const message of messages) {
    let changed = false;
    const resolvedParts: vscode.LanguageModelInputPart[] = [];

    for (const part of message.content as readonly vscode.LanguageModelInputPart[]) {
      if (!isImageDataPart(part)) {
        resolvedParts.push(part);
        continue;
      }

      changed = true;
      const description = visionModel
        ? await describeImageWithCache(part, visionModel, token)
        : undefined;
      if (description) {
        describedImages += 1;
        resolvedParts.push(new vscode.LanguageModelTextPart(createImageDescriptionText(description)));
      } else {
        unavailableImages += 1;
        resolvedParts.push(new vscode.LanguageModelTextPart(IMAGE_DESCRIPTION_UNAVAILABLE));
      }
    }

    resolvedMessages.push(changed
      ? ({ role: message.role, content: resolvedParts, name: message.name } as vscode.LanguageModelChatRequestMessage)
      : message
    );
  }

  return {
    messages: resolvedMessages,
    describedImages,
    unavailableImages,
    visionModelId: visionModel?.id,
  };
}

async function getVisionModel(model: ResolvedModelConfig): Promise<vscode.LanguageModelChat | undefined> {
  if (cachedVisionModel) {
    return cachedVisionModel;
  }
  if (!cachedVisionModelPromise) {
    cachedVisionModelPromise = (async () => {
      const candidates = await vscode.lm.selectChatModels();
      const usable = candidates
        .filter((candidate) =>
          isUsableVisionCandidate(candidate) &&
          candidate.id !== model.registeredId &&
          candidate.id !== model.id
        )
        .sort((a, b) => Number(a.vendor === 'allin') - Number(b.vendor === 'allin'));
      cachedVisionModel = usable[0];
      if (cachedVisionModel) {
        logger.info('Using vision proxy model.', {
          id: cachedVisionModel.id,
          vendor: cachedVisionModel.vendor,
        });
      }
      return cachedVisionModel;
    })();
  }
  return cachedVisionModelPromise;
}

function isUsableVisionCandidate(candidate: vscode.LanguageModelChat): boolean {
  if (candidate.vendor !== 'allin') {
    const identity = `${candidate.id} ${candidate.name} ${candidate.family}`.toLowerCase();
    return !/(deepseek|reasoner|embedding|embed|whisper|code-fast)/.test(identity);
  }
  return getModelByRegisteredId(candidate.id)?.vision === true;
}

async function describeImageWithCache(
  part: vscode.LanguageModelDataPart,
  visionModel: vscode.LanguageModelChat,
  token: vscode.CancellationToken,
): Promise<string | undefined> {
  const key = createImageCacheKey(part, visionModel.id);
  const cached = descriptionCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const pending = pendingDescriptions.get(key) ?? describeImage(part, visionModel, token);
  pendingDescriptions.set(key, pending);
  try {
    const description = (await pending).trim();
    if (description) {
      descriptionCache.set(key, description);
      pruneDescriptionCache();
      return description;
    }
    return undefined;
  } catch (error) {
    logger.warn('Vision proxy failed.', formatError(error));
    return undefined;
  } finally {
    pendingDescriptions.delete(key);
  }
}

async function describeImage(
  part: vscode.LanguageModelDataPart,
  visionModel: vscode.LanguageModelChat,
  token: vscode.CancellationToken,
): Promise<string> {
  if (token.isCancellationRequested) {
    return '';
  }

  const message = vscode.LanguageModelChatMessage.User([
    part,
    new vscode.LanguageModelTextPart(IMAGE_DESCRIPTION_PROMPT),
  ]);
  const response = await visionModel.sendRequest([message], {}, token);
  let description = '';
  for await (const chunk of response.stream) {
    if (chunk instanceof vscode.LanguageModelTextPart) {
      description += chunk.value;
    }
  }
  return description.trim();
}

function createImageDescriptionText(description: string): string {
  return IMAGE_DESCRIPTION_PREFIX + description + IMAGE_DESCRIPTION_SUFFIX;
}

function isImageDataPart(part: unknown): part is vscode.LanguageModelDataPart {
  return part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith('image/');
}

function createImageCacheKey(part: vscode.LanguageModelDataPart, visionModelId: string): string {
  return crypto
    .createHash('sha256')
    .update('v1')
    .update('\0')
    .update(part.mimeType)
    .update('\0')
    .update(Buffer.from(part.data))
    .update('\0')
    .update(visionModelId)
    .digest('base64url');
}

function pruneDescriptionCache(): void {
  while (descriptionCache.size > 100) {
    const oldest = descriptionCache.keys().next().value as string | undefined;
    if (!oldest) {
      return;
    }
    descriptionCache.delete(oldest);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
