import { describe, expect, it, vi } from "vitest";

import { SpeechToTextInvalidAudioError, VoiceTranscriptionPlanRequiredError } from "@/errors";
import { VoiceTranscriptionService } from "@/services/voice-transcription-service";
import type { ServiceConfig } from "@/types";

const config = {
  openaiApiKey: "test-openai-key",
} as ServiceConfig;

function makeDb(plan: "free" | "pro" | "premium", usedSeconds = 0) {
  const insertedValues: unknown[] = [];
  let selectCalls = 0;
  const db = {
    insertedValues,
    select: vi.fn(() => {
      selectCalls += 1;
      if (selectCalls === 1) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [{ plan }]),
            })),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ totalSeconds: usedSeconds }]),
        })),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: unknown) => {
        insertedValues.push(values);
      }),
    })),
  };

  return db;
}

const organizationService = {
  getMembershipRole: vi.fn(async () => "member"),
} as never;

describe("VoiceTranscriptionService", () => {
  it("rejects empty audio files", async () => {
    const service = new VoiceTranscriptionService(makeDb("pro") as never, config, organizationService);
    const audioFile = new File([], "empty.webm", { type: "audio/webm" });

    await expect(
      service.transcribe({
        actorUserId: "user-1",
        organizationId: "org-1",
        audioFile,
        durationSeconds: 1,
      }),
    ).rejects.toBeInstanceOf(SpeechToTextInvalidAudioError);
  });

  it("blocks free organizations", async () => {
    const service = new VoiceTranscriptionService(makeDb("free") as never, config, organizationService);
    const audioFile = new File(["audio"], "input.webm", { type: "audio/webm" });

    await expect(
      service.transcribe({
        actorUserId: "user-1",
        organizationId: "org-1",
        audioFile,
        durationSeconds: 60,
      }),
    ).rejects.toBeInstanceOf(VoiceTranscriptionPlanRequiredError);
  });

  it("transcribes audio, optimizes it, and records usage", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "fix the broken tests and commit it" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output_text: "Fix the failing tests, then create a commit with the changes." }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const db = makeDb("pro");
    const service = new VoiceTranscriptionService(db as never, config, organizationService);
    const audioFile = new File(["audio"], "input.webm", { type: "audio/webm" });

    const result = await service.transcribe({
      actorUserId: "user-1",
      organizationId: "org-1",
      audioFile,
      durationSeconds: 120,
    });

    expect(result).toEqual({
      transcript: "fix the broken tests and commit it",
      optimizedText: "Fix the failing tests, then create a commit with the changes.",
      usage: {
        durationSeconds: 120,
        quotaMinutes: 300,
        usedSeconds: 120,
        remainingSeconds: 17_880,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(db.insertedValues).toMatchObject([
      {
        organizationId: "org-1",
        userId: "user-1",
        durationSeconds: 120,
        status: "succeeded",
      },
    ]);

    vi.unstubAllGlobals();
  });
});
