/**
 * Pure types + channel helpers. NO Node imports — safe to use from client
 * components. All file I/O stays in `lib/missionStream.ts`.
 */

export type MessageRole = 'user' | 'agent' | 'system' | 'tool'
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error'
export type MessageVisibility = 'communal' | 'private'

/**
 * A channel is a room in the building.
 *   - `office:bob`           = private room shared between Bo and Bob
 *   - `boardroom`            = the shared room, opt-in only
 *   - `meeting:bob+linda`    = a temporary cross-agent meeting
 */
export type ChannelId = string

export const BOARDROOM: ChannelId = 'boardroom'

export function officeChannel(agentId: string): ChannelId {
  return `office:${agentId}`
}

export function meetingChannel(agentIds: string[]): ChannelId {
  const sorted = [...new Set(agentIds)].sort()
  return `meeting:${sorted.join('+')}`
}

export function isOffice(channel: ChannelId): boolean {
  return channel.startsWith('office:')
}

export function officeAgentId(channel: ChannelId): string | null {
  return channel.startsWith('office:') ? channel.slice('office:'.length) : null
}

export function isMeeting(channel: ChannelId): boolean {
  return channel.startsWith('meeting:')
}

export interface MissionMessage {
  id:         string
  ts:         number
  agentId:    string          // 'bo' for user, otherwise agent id
  role:       MessageRole
  content:    string
  mentions:   string[]        // agent ids mentioned via @name
  replyTo:    string | null
  status:     MessageStatus
  visibility: MessageVisibility
  channel:    ChannelId       // which room this message lives in
  sharedFrom?: {              // set when a message was promoted from another channel
    channel:  ChannelId
    by:       string
    at:       number
    sourceId: string
  }
  toolCalls?: Array<{ name: string; args: unknown; result?: unknown }>
}
