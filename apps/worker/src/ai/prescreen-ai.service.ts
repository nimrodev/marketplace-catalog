import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RiskLevel } from '@marketplace/shared';
import { AnthropicClientService, StructuredImage } from './anthropic-client.service';
import { PRESCREEN_MODEL } from './anthropic-models';

const TIMEOUT_MS = 15_000;
const TOOL_NAME = 'emit_prescreen_result';

export interface PrescreenAiInput {
  title: string;
  description: string;
  images: StructuredImage[];
}

export interface PrescreenAiResult {
  level: RiskLevel;
  reasons: string[];
  flags: string[];
}

const prescreenSchema = z.object({
  level: z.enum(RiskLevel),
  reasons: z.array(z.string()),
  flags: z.array(z.string()),
});

function buildJsonSchema() {
  return {
    type: 'object' as const,
    properties: {
      level: { type: 'string' as const, enum: Object.values(RiskLevel) },
      reasons: { type: 'array' as const, items: { type: 'string' as const }, description: 'Short, human-readable reasons behind the level' },
      flags: { type: 'array' as const, items: { type: 'string' as const }, description: 'Specific policy flags raised, if any' },
    },
    required: ['level', 'reasons', 'flags'],
  };
}

// Distinct in purpose from draft-listing's prompt: this screens a listing
// that's already been submitted for policy risk, it never drafts content.
function buildSystemPrompt(): string {
  return [
    'You are a moderation pre-screen for a secondhand marketplace listing.',
    'Given the title, description, and photos, assess policy risk: prohibited or illegal items (weapons, drugs, counterfeits),',
    'obvious scams, adult content, and photo/description mismatches (photos showing a materially different item than described).',
    'level: HIGH for a clear prohibited item, illegal listing, obvious scam, or adult content.',
    'MEDIUM for a thin or duplicated description, a price wildly off for the item, a stock or watermarked photo, or contact details/URLs in the description.',
    'LOW for a normal listing with nothing of concern.',
    'reasons: one short sentence per concern actually observed, empty array if none.',
    'flags: short specific labels for anything raised (e.g. "counterfeit branding", "photo mismatch"), empty array if none.',
    'This is advisory only — you never approve or reject anything, a human moderator makes that call using your output.',
  ].join(' ');
}

// Duplicated shape of apps/api's DraftListingService, but for the
// pre-screen use case: screens an already-submitted listing rather than
// drafting one.
@Injectable()
export class PrescreenAiService {
  constructor(private readonly anthropic: AnthropicClientService) {}

  async screen(input: PrescreenAiInput): Promise<PrescreenAiResult> {
    return this.anthropic.generateStructured({
      model: PRESCREEN_MODEL,
      system: buildSystemPrompt(),
      prompt: `Title: ${input.title}\n\nDescription: ${input.description}`,
      images: input.images,
      toolName: TOOL_NAME,
      toolDescription: 'Emits a structured pre-screen risk assessment for a marketplace listing.',
      jsonSchema: buildJsonSchema(),
      schema: prescreenSchema,
      timeoutMs: TIMEOUT_MS,
    });
  }
}
