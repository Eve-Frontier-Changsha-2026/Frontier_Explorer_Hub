import type { Response } from 'express';
import type { SSEEvent } from '../../types/index.js';

export function createSSEStream(res: Response): {
  send(event: SSEEvent): void;
  close(): void;
} {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  return {
    send(event: SSEEvent): void {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event.data)}\n`);
      res.write(`id: ${event.timestamp}\n\n`);
    },
    close(): void {
      res.end();
    },
  };
}

export class SSEBroadcaster {
  private clients = new Map<string, Response>();

  addClient(id: string, res: Response): void {
    this.clients.set(id, res);
    res.on('close', () => this.removeClient(id));
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  broadcast(event: SSEEvent): void {
    for (const [id, res] of this.clients) {
      try {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event.data)}\n`);
        res.write(`id: ${event.timestamp}\n\n`);
      } catch {
        this.removeClient(id);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

/** Singleton — reserved for approach C upgrade */
export const sseBroadcaster = new SSEBroadcaster();
