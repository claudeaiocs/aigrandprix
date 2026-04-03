import { BotRegistration, Strategy, TyreCompound, FuelMode } from '../types';
import { v4 as uuid } from 'uuid';

export default class BotManager {
  bots: Map<string, BotRegistration> = new Map();
  strategies: Map<string, Strategy> = new Map();

  register(name: string, team: string, teamColor: string): { bot: BotRegistration; apiKey: string } {
    const id = uuid();
    const apiKey = uuid();

    const bot: BotRegistration = {
      id,
      name,
      team,
      teamColor,
      driverCode: '',
      apiKey,
      createdAt: Date.now(),
    };

    this.bots.set(id, bot);

    return { bot, apiKey };
  }

  getBot(id: string): BotRegistration | undefined {
    return this.bots.get(id);
  }

  getBotByApiKey(apiKey: string): BotRegistration | undefined {
    for (const bot of this.bots.values()) {
      if (bot.apiKey === apiKey) {
        return bot;
      }
    }
    return undefined;
  }

  updateDriverCode(botId: string, code: string): void {
    const bot = this.bots.get(botId);
    if (bot) {
      bot.driverCode = code;
    }
  }

  updateStrategy(botId: string, updates: Partial<Strategy>): Strategy {
    const current = this.getStrategy(botId);
    const merged: Strategy = {
      ...current,
      ...updates,
      pitWindow: {
        ...current.pitWindow,
        ...(updates.pitWindow || {}),
      },
      customData: {
        ...current.customData,
        ...(updates.customData || {}),
      },
    };
    this.strategies.set(botId, merged);
    return merged;
  }

  getStrategy(botId: string): Strategy {
    return this.strategies.get(botId) || this.getDefaultStrategy();
  }

  getDefaultStrategy(): Strategy {
    return {
      mode: 'normal',
      compound: 'medium',
      fuelMode: 'standard',
      pitWindow: { start: 10, end: 30 },
      boxThisLap: false,
      customData: {},
    };
  }

  getAllBots(): BotRegistration[] {
    return Array.from(this.bots.values());
  }
}
