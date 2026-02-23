/**
 * AgentRouter — one per connected browser client.
 *
 * Maintains a pool of OpenClawGateway instances, one per agentId.
 * Each gateway represents a dedicated session on the OpenClaw gateway,
 * pre-switched to the correct agent, so messages are always isolated.
 */

import WebSocket from 'ws'
import { OpenClawGateway } from './OpenClawGateway'
import type { ClientMessage, ServerMessage } from './types'

export class AgentRouter {
  private browser:  WebSocket
  private gateways: Map<string, OpenClawGateway> = new Map()

  constructor(browser: WebSocket) {
    this.browser = browser
  }

  async handle(msg: ClientMessage) {
    switch (msg.type) {
      case 'ping':
        this.send({ type: 'pong' })
        break

      case 'msg': {
        let gw: OpenClawGateway
        try {
          gw = await this.getOrCreate(msg.agentId)
        } catch (err) {
          console.error(`[Router] Could not open gateway for ${msg.agentId}:`, err)
          this.send({ type: 'error', agentId: msg.agentId, message: 'Could not connect to OpenClaw gateway.' })
          return
        }
        this.send({ type: 'status', agentId: msg.agentId, status: 'thinking' })
        gw.send(msg.content)
        break
      }

      case 'interrupt': {
        const gw = this.gateways.get(msg.agentId)
        if (gw) {
          gw.interrupt()
          this.send({ type: 'done', agentId: msg.agentId })
        }
        break
      }
    }
  }

  private async getOrCreate(agentId: string): Promise<OpenClawGateway> {
    const existing = this.gateways.get(agentId)
    if (existing) return existing

    const gw = new OpenClawGateway(agentId, (msg: ServerMessage) => this.send(msg))
    await gw.connect()
    this.gateways.set(agentId, gw)
    this.send({ type: 'connected', agentId })
    return gw
  }

  private send(msg: ServerMessage) {
    if (this.browser.readyState === WebSocket.OPEN) {
      this.browser.send(JSON.stringify(msg))
    }
  }

  cleanup() {
    console.log('[Router] Cleaning up gateways')
    this.gateways.forEach((gw) => gw.disconnect())
    this.gateways.clear()
  }
}
