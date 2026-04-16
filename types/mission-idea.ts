/**
 * Mission Idea — raw surface for agent-originated suggestions.
 *
 * Ideas are what an agent *thinks* Bo should consider. They sit in a
 * lightweight pre-task queue: Bo skims, promotes the good ones to real
 * tasks (populating `linkedTaskId`), and dismisses the rest. This keeps
 * the mission-tasks queue clean while giving agents a place to speak up.
 */

export type IdeaStatus = 'fresh' | 'claimed' | 'dismissed'

export interface MissionIdea {
  id:            string      // crypto.randomUUID()
  agentId:       string      // who came up with it ('doc' | 'linda' | 'marcus' | 'vault')
  title:         string      // max 120 chars
  body:          string      // max 2000 chars, one-paragraph description
  createdAt:     number      // unix ms
  updatedAt:     number      // unix ms
  status:        IdeaStatus  // fresh = not yet reviewed; claimed = promoted; dismissed
  linkedTaskId?: string      // populated when Bo promotes the idea to a task
  tags?:         string[]    // freeform, extracted from title/body
}
