import { z } from "zod";

import { nonEmptyStringSchema, orgIdParamSchema } from "@/validation/common";

export const voiceTranscriptionParamsSchema = orgIdParamSchema;

export const voiceTranscriptionFormSchema = z.object({
  audio: z.instanceof(File),
  durationSeconds: z.coerce.number().int().positive().max(60),
  prompt: nonEmptyStringSchema.optional(),
});

export type VoiceTranscriptionParamsInput = z.infer<typeof voiceTranscriptionParamsSchema>;
export type VoiceTranscriptionFormInput = z.infer<typeof voiceTranscriptionFormSchema>;
