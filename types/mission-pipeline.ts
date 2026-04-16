/**
 * Mission Pipeline — multi-step orchestrated runs across the fleet.
 *
 * A pipeline is a sequence of agent steps that execute in order. Each
 * step captures its own start/end time, output, and (if it failed) the
 * error. Pipelines have templates (BUILD / LAUNCH / QA / RESEARCH /
 * CUSTOM) for common patterns. Execution itself is implemented in
 * Phase 4; this file just defines the shape.
 */

export type PipelineStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type PipelineStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface PipelineStep {
  agentId:    string
  status:     PipelineStepStatus
  startedAt?: number
  endedAt?:   number
  output?:    string   // the agent's agentReport
  error?:     string
}

export interface MissionPipeline {
  id:           string           // crypto.randomUUID()
  title:        string           // what Bo asked for
  initiatedBy:  string           // 'bo' | agent id
  createdAt:    number
  updatedAt:    number
  status:       PipelineStatus
  currentStep:  number            // 0-indexed
  steps:        PipelineStep[]
  template?:    string            // 'BUILD' | 'LAUNCH' | 'QA' | 'RESEARCH' | 'CUSTOM'
  finalOutput?: string
}
