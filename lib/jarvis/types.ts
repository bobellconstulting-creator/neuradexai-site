/**
 * Shared types for Jarvis evolved-learner brain.
 *
 * All external (model output, HTTP body) data flows through Zod schemas
 * defined here. Internal call sites should `z.infer` the type.
 */

import { z } from 'zod'

// ─── Reflection extraction schemas ──────────────────────────────────────────

const Confidence = z.number().min(0).max(1)

export const ProfileDeltaSchema = z.object({
  field: z.string().min(1).max(80),
  value: z.string().min(1).max(800),
  confidence: Confidence,
})
export type ProfileDelta = z.infer<typeof ProfileDeltaSchema>

export const PreferenceSchema = z.object({
  kind: z.enum(['liked', 'disliked']),
  about: z.string().min(1).max(200),
  detail: z.string().min(1).max(800),
  confidence: Confidence,
})
export type Preference = z.infer<typeof PreferenceSchema>

export const DecisionSchema = z.object({
  decision: z.string().min(1).max(800),
  rationale: z.string().max(800).optional().default(''),
  confidence: Confidence,
})
export type Decision = z.infer<typeof DecisionSchema>

export const MistakeSchema = z.object({
  mistake: z.string().min(1).max(800),
  avoidance: z.string().max(800).optional().default(''),
  confidence: Confidence,
})
export type Mistake = z.infer<typeof MistakeSchema>

export const OpenQuestionSchema = z.object({
  question: z.string().min(1).max(800),
  confidence: Confidence,
})
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>

export const CognitivePatternSchema = z.object({
  pattern: z.string().min(1).max(200),
  evidence: z.string().min(1).max(600),
  confidence: Confidence,
})
export type CognitivePattern = z.infer<typeof CognitivePatternSchema>

export const InstinctKind = z.enum([
  'preference',
  'decision',
  'mistake',
  'profile',
  'question',
  'knowledge',
])
export type InstinctKindT = z.infer<typeof InstinctKind>

export const InstinctSchema = z.object({
  kind: InstinctKind,
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(2000),
  confidence: Confidence,
  source: z.string().max(200).optional().default('reflection'),
})
export type Instinct = z.infer<typeof InstinctSchema>

export const ReflectionResultSchema = z.object({
  facts: z.array(ProfileDeltaSchema).default([]),
  preferences: z.array(PreferenceSchema).default([]),
  decisions: z.array(DecisionSchema).default([]),
  mistakes: z.array(MistakeSchema).default([]),
  openQuestions: z.array(OpenQuestionSchema).default([]),
  cognitivePatterns: z.array(CognitivePatternSchema).default([]),
  summary: z.string().max(1200).default(''),
})
export type ReflectionResult = z.infer<typeof ReflectionResultSchema>

// ─── Persisted instinct file (with metadata) ────────────────────────────────

export const PersistedInstinctSchema = InstinctSchema.extend({
  hash: z.string().length(16),
  promoted: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type PersistedInstinct = z.infer<typeof PersistedInstinctSchema>

// ─── Reflect endpoint request ───────────────────────────────────────────────

export const ReflectRequestSchema = z.object({
  transcript: z.string().min(1).max(200_000),
  sessionId: z.string().max(120).optional(),
})
export type ReflectRequest = z.infer<typeof ReflectRequestSchema>
