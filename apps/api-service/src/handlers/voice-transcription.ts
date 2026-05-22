import type { AppContext } from "@/hono";
import type { VoiceTranscriptionFormInput, VoiceTranscriptionParamsInput } from "@/validation/voice-transcription";

export async function voiceTranscribeHandler(
  c: AppContext,
  params: VoiceTranscriptionParamsInput,
  form: VoiceTranscriptionFormInput,
) {
  const actorUser = c.get("sessionUser");
  const result = await c.get("services").voiceTranscription.transcribe({
    actorUserId: actorUser.id,
    organizationId: params.orgId,
    organizationRole: c.get("organizationRole"),
    audioFile: form.audio,
    durationSeconds: form.durationSeconds,
    prompt: form.prompt,
  });

  return c.json(result);
}
