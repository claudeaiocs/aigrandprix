import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import RaceEngine from '../race/RaceEngine';
import { LiveFeed } from '../types';

export class LiveSocket {
  wss: WebSocketServer;
  clients: Set<WebSocket> = new Set();
  raceEngine: RaceEngine;

  constructor(server: Server, raceEngine: RaceEngine) {
    this.raceEngine = raceEngine;

    this.wss = new WebSocketServer({ server, path: '/ws/live' });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      this.raceEngine.spectatorCount++;

      ws.on('close', () => {
        this.clients.delete(ws);
        this.raceEngine.spectatorCount = Math.max(0, this.raceEngine.spectatorCount - 1);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
        this.raceEngine.spectatorCount = Math.max(0, this.raceEngine.spectatorCount - 1);
      });
    });

    // Wire up the engine's live feed callback to broadcast
    this.raceEngine.onLiveFeed = (feed: LiveFeed) => this.broadcast(feed);
  }

  broadcast(feed: LiveFeed): void {
    const data = JSON.stringify(feed);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      } else {
        // Remove dead connections
        this.clients.delete(client);
        this.raceEngine.spectatorCount = Math.max(0, this.raceEngine.spectatorCount - 1);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export default LiveSocket;
