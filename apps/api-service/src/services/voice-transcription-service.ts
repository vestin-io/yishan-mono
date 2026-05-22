import { and, eq, gte, sql } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import type { OrganizationMemberRole, OrganizationPlan } from "@/db/schema";
import { organizations, voiceUsageActivities } from "@/db/schema";
import {
  AppError,
  OrganizationNotFoundError,
  SpeechToTextInvalidAudioError,
  SpeechToTextOptimizationFailedError,
  SpeechToTextTranscriptionFailedError,
  VoiceTranscriptionPlanRequiredError,
  VoiceTranscriptionQuotaExceededError,
} from "@/errors";
import { newId } from "@/lib/id";
import type { OrganizationService } from "@/services/organization-service";
import { assertOrganizationMember } from "@/services/shared/assertOrganizationMember";
import type { ServiceConfig } from "@/types";

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const OPTIMIZATION_MODEL = "gpt-4o-mini";
const TRANSCRIPTION_PROMPT =
  "The speaker is likely a software engineer or developer dictating instructions for an agent CLI. Prefer common software terms, command names, flags, package names, file paths, APIs, frameworks, programming languages, git terminology, and code-related words when audio is ambiguous.";

const PLAN_QUOTA_MINUTES: Record<Exclude<OrganizationPlan, "free">, number> = {
  pro: 300,
  premium: 1_000,
};

type OpenAITextResponse = {
  output_text?: unknown;
  output?: unknown;
};

type OpenAITranscriptionResponse = {
  text?: unknown;
};

type TranscribeInput = {
  actorUserId: string;
  organizationId: string;
  organizationRole?: OrganizationMemberRole;
  audioFile: File;
  durationSeconds: number;
  prompt?: string;
};

export class VoiceTranscriptionService {
  constructor(
    private readonly db: AppDb,
    private readonly config: ServiceConfig,
    private readonly organizationService: OrganizationService,
  ) {}

  async transcribe(input: TranscribeInput): Promise<{
    transcript: string;
    optimizedText: string;
    usage: { durationSeconds: number; quotaMinutes: number; usedSeconds: number; remainingSeconds: number };
  }> {
    if (!input.audioFile || input.audioFile.size === 0) {
      throw new SpeechToTextInvalidAudioError();
    }

    await assertOrganizationMember(
      this.organizationService,
      input.organizationId,
      input.actorUserId,
      input.organizationRole,
    );

    const quota = await this.assertQuotaAvailable(input);

    try {
      const transcript = await this.transcribeAudio(input.audioFile, input.prompt);
      const optimizedText = await this.optimizeTranscript(transcript, input.prompt);
      await this.recordUsage(input, "succeeded");

      return {
        transcript,
        optimizedText,
        usage: {
          durationSeconds: input.durationSeconds,
          quotaMinutes: quota.quotaMinutes,
          usedSeconds: quota.usedSeconds + input.durationSeconds,
          remainingSeconds: quota.remainingSeconds - input.durationSeconds,
        },
      };
    } catch (error) {
      await this.recordUsage(input, "failed", error instanceof AppError ? error.code : "VOICE_TRANSCRIPTION_FAILED");
      throw error;
    }
  }

  private async assertQuotaAvailable(input: TranscribeInput) {
    const organizationRows = await this.db
      .select({ plan: organizations.plan })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    const plan = organizationRows[0]?.plan;

    if (!plan) {
      throw new OrganizationNotFoundError(input.organizationId);
    }

    if (plan === "free") {
      throw new VoiceTranscriptionPlanRequiredError();
    }

    const quotaMinutes = PLAN_QUOTA_MINUTES[plan];
    const quotaSeconds = quotaMinutes * 60;
    const usedSeconds = await this.getUsedSeconds(input, plan);
    const remainingSeconds = quotaSeconds - usedSeconds;

    if (input.durationSeconds > remainingSeconds) {
      throw new VoiceTranscriptionQuotaExceededError({
        plan,
        quotaMinutes,
        usedSeconds,
        requestedSeconds: input.durationSeconds,
        remainingSeconds: Math.max(remainingSeconds, 0),
      });
    }

    return { quotaMinutes, usedSeconds, remainingSeconds };
  }

  private async getUsedSeconds(input: TranscribeInput, plan: Exclude<OrganizationPlan, "free">): Promise<number> {
    const monthStart = this.getMonthStart(new Date());
    const filters = [
      eq(voiceUsageActivities.organizationId, input.organizationId),
      eq(voiceUsageActivities.status, "succeeded"),
      gte(voiceUsageActivities.createdAt, monthStart),
    ];

    if (plan === "pro") {
      filters.push(eq(voiceUsageActivities.userId, input.actorUserId));
    }

    const rows = await this.db
      .select({ totalSeconds: sql<number>`coalesce(sum(${voiceUsageActivities.durationSeconds}), 0)::int` })
      .from(voiceUsageActivities)
      .where(and(...filters));

    return rows[0]?.totalSeconds ?? 0;
  }

  private getMonthStart(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private async recordUsage(input: TranscribeInput, status: "succeeded" | "failed", errorCode?: string): Promise<void> {
    await this.db.insert(voiceUsageActivities).values({
      id: newId(),
      organizationId: input.organizationId,
      userId: input.actorUserId,
      durationSeconds: input.durationSeconds,
      status,
      errorCode,
    });
  }

  private async transcribeAudio(audioFile: File, prompt?: string): Promise<string> {
    const formData = new FormData();
    formData.append("model", TRANSCRIPTION_MODEL);
    formData.append("file", audioFile);
    formData.append("prompt", [TRANSCRIPTION_PROMPT, prompt?.trim()].filter(Boolean).join("\n\n"));

    const response = await fetch(`${OPENAI_API_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.openaiApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new SpeechToTextTranscriptionFailedError();
    }

    const body = (await response.json()) as OpenAITranscriptionResponse;
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      throw new SpeechToTextTranscriptionFailedError();
    }

    return body.text.trim();
  }

  private async optimizeTranscript(transcript: string, prompt?: string): Promise<string> {
    const promptPrefix = prompt ? `${prompt.trim()}\n\nTranscript:\n` : "Transcript:\n";
    const response = await fetch(`${OPENAI_API_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPTIMIZATION_MODEL,
        input: [
          {
            role: "system",
            content:
              "Rewrite speech-to-text output into clear, well-structured input for an agent CLI. Preserve the user's intent, concrete names, paths, commands, flags, and constraints. Fix transcription mistakes only when obvious. Return only the optimized CLI prompt text.",
          },
          {
            role: "user",
            content: `${promptPrefix}${transcript}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new SpeechToTextOptimizationFailedError();
    }

    const body = (await response.json()) as OpenAITextResponse;
    const optimizedText = this.getResponseText(body);
    if (!optimizedText) {
      throw new SpeechToTextOptimizationFailedError();
    }

    return optimizedText;
  }

  private getResponseText(body: OpenAITextResponse): string | null {
    if (typeof body.output_text === "string" && body.output_text.trim().length > 0) {
      return body.output_text.trim();
    }

    if (!Array.isArray(body.output)) {
      return null;
    }

    for (const outputItem of body.output) {
      if (!outputItem || typeof outputItem !== "object" || !("content" in outputItem)) {
        continue;
      }

      const content = (outputItem as { content?: unknown }).content;
      if (!Array.isArray(content)) {
        continue;
      }

      for (const contentItem of content) {
        if (!contentItem || typeof contentItem !== "object" || !("text" in contentItem)) {
          continue;
        }

        const text = (contentItem as { text?: unknown }).text;
        if (typeof text === "string" && text.trim().length > 0) {
          return text.trim();
        }
      }
    }

    return null;
  }
}
