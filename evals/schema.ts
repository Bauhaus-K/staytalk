import { z } from "zod";
import { GUEST_LANGUAGES } from "../src/server/language/codes";

const reason = z.enum([
  "UNKNOWN_ANSWER",
  "COMPLAINT",
  "REFUND",
  "EMERGENCY",
  "GUEST_REQUESTED_HUMAN",
  "BOOKING_CHANGE",
  "USAGE_LIMIT",
]);

export const evalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  property: z.enum(["seoul", "fukuoka"]),
  category: z.enum([
    "faq",
    "unknown",
    "booking",
    "complaint",
    "refund",
    "emergency",
    "injection",
    "pii",
    "human",
  ]),
  description: z.string().optional(),
  /** Guest messages sent in order in one conversation; checks apply to the last one. */
  turns: z.array(z.string().min(1)).min(1),
  /** Skip until this phase ships the needed tools. */
  requiresPhase: z.number().int().optional(),
  /** Modes the case runs in (default both). Live-only cases need language understanding. */
  modes: z.array(z.enum(["mock", "live"])).optional(),
  expect: z
    .object({
      /** Detected language of the last guest message. */
      language: z.enum(GUEST_LANGUAGES).optional(),
      /** Language of the reply (live mode only; the mock does not translate). */
      replyLanguage: z.enum(GUEST_LANGUAGES).optional(),
      escalate: z.boolean().optional(),
      escalationReasonIn: z.array(reason).optional(),
      toolsCalled: z.array(z.string()).optional(),
      toolsNotCalled: z.array(z.string()).optional(),
      /** Every group must match; a group matches if the reply contains any of its strings (case-insensitive). */
      replyIncludes: z.array(z.array(z.string()).min(1)).optional(),
      replyExcludes: z.array(z.string()).optional(),
      citesKnowledge: z.boolean().optional(),
      /** Strings that must not be persisted in the stored guest message (PII). */
      storedGuestExcludes: z.array(z.string()).optional(),
    })
    .strict(),
});

export type EvalCase = z.infer<typeof evalCaseSchema>;
export const evalFileSchema = z.array(evalCaseSchema);
