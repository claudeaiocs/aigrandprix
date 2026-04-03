import { Router, Request, Response, NextFunction } from 'express';
import BotManager from '../bot/BotManager';
import RaceEngine from '../race/RaceEngine';
import { Strategy } from '../types';
import { silverstoneTrack } from '../track/silverstone';

// Extend Express Request to carry authenticated bot info
interface AuthenticatedRequest extends Request {
  bot?: ReturnType<BotManager['getBot']>;
}

function createRouter(botManager: BotManager, raceEngine: RaceEngine): Router {
  const router = Router();

  // -------------------------------------------------------
  // Auth middleware helper
  // -------------------------------------------------------
  function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const apiKey =
      (req.headers['x-api-key'] as string | undefined) ||
      (req.query.apiKey as string | undefined);

    if (!apiKey) {
      res.status(401).json({ error: 'Missing API key. Provide X-API-Key header or ?apiKey= query param.' });
      return;
    }

    const bot = botManager.getBotByApiKey(apiKey);
    if (!bot) {
      res.status(401).json({ error: 'Invalid API key.' });
      return;
    }

    req.bot = bot;
    next();
  }

  /**
   * Verify that the authenticated bot owns the resource identified by :id or :botId.
   */
  function requireOwnership(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const targetId = req.params.id || req.params.botId;
    if (req.bot && req.bot.id !== targetId) {
      res.status(403).json({ error: 'You can only modify your own bot.' });
      return;
    }
    next();
  }

  // -------------------------------------------------------
  // Public endpoints (no auth)
  // -------------------------------------------------------

  /** GET /api/track/live - current live feed */
  router.get('/api/track/live', (_req: Request, res: Response) => {
    const feed = raceEngine.getLiveFeed();
    res.json(feed);
  });

  /** GET /api/tracks - available tracks (includes full segment data for rendering) */
  router.get('/api/tracks', (_req: Request, res: Response) => {
    res.json([
      {
        name: silverstoneTrack.name,
        segmentCount: silverstoneTrack.segments.length,
        length: silverstoneTrack.segments.length,
        segments: silverstoneTrack.segments,
        pitLane: silverstoneTrack.pitLane,
        drsZones: silverstoneTrack.drsZones,
        startFinishIndex: silverstoneTrack.startFinishIndex,
      },
    ]);
  });

  /** GET /api/leaderboard - standings */
  router.get('/api/leaderboard', (_req: Request, res: Response) => {
    const bots = botManager.getAllBots();
    const feed = raceEngine.getLiveFeed();
    const carMap = new Map(feed.cars.map((c) => [c.id, c]));

    const standings = bots.map((bot) => {
      const car = carMap.get(bot.id);
      return {
        botId: bot.id,
        name: bot.name,
        team: bot.team,
        teamColor: bot.teamColor,
        bestLapTime: car?.bestLapTime ?? null,
        lastLapTime: car?.lastLapTime ?? null,
        position: car?.position ?? null,
      };
    });

    // Sort by position (null positions last)
    standings.sort((a, b) => {
      if (a.position === null && b.position === null) return 0;
      if (a.position === null) return 1;
      if (b.position === null) return -1;
      return a.position - b.position;
    });

    res.json(standings);
  });

  /** GET /api/schedule - mock upcoming schedule */
  router.get('/api/schedule', (_req: Request, res: Response) => {
    const now = Date.now();
    res.json([
      {
        id: 'practice-1',
        type: 'practice',
        track: 'Silverstone Grand Prix Circuit',
        startTime: now,
        status: 'active',
      },
      {
        id: 'qualifying-1',
        type: 'qualifying',
        track: 'Silverstone Grand Prix Circuit',
        startTime: now + 3600_000,
        status: 'upcoming',
      },
      {
        id: 'race-1',
        type: 'race',
        track: 'Silverstone Grand Prix Circuit',
        startTime: now + 7200_000,
        status: 'upcoming',
      },
    ]);
  });

  // -------------------------------------------------------
  // Registration (no auth required to register)
  // -------------------------------------------------------

  /** POST /api/register - register a new bot */
  router.post('/api/register', (req: Request, res: Response) => {
    const { name, team, teamColor } = req.body || {};

    if (!name || !team) {
      res.status(400).json({ error: 'name and team are required.' });
      return;
    }

    const { bot, apiKey } = botManager.register(
      name,
      team,
      teamColor || '#ffffff',
    );

    res.status(201).json({ botId: bot.id, apiKey });
  });

  // -------------------------------------------------------
  // Authenticated & ownership-protected endpoints
  // -------------------------------------------------------

  /** POST /api/bot/:id/driver - upload drive() function code */
  router.post(
    '/api/bot/:id/driver',
    requireAuth,
    requireOwnership,
    (req: AuthenticatedRequest, res: Response) => {
      const { code } = req.body || {};
      if (!code) {
        res.status(400).json({ error: 'code is required.' });
        return;
      }
      botManager.updateDriverCode(req.params.id, code);
      res.json({ success: true, message: 'Driver code uploaded.' });
    },
  );

  /** POST /api/bot/:id/join-practice - add bot car to practice */
  router.post(
    '/api/bot/:id/join-practice',
    requireAuth,
    requireOwnership,
    (req: AuthenticatedRequest, res: Response) => {
      try {
        raceEngine.addCar(req.params.id);
        res.json({ success: true, message: 'Joined practice session.' });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to join practice.' });
      }
    },
  );

  /** POST /api/bot/:id/leave-practice - remove bot car from practice */
  router.post(
    '/api/bot/:id/leave-practice',
    requireAuth,
    requireOwnership,
    (req: AuthenticatedRequest, res: Response) => {
      try {
        raceEngine.removeCar(req.params.id);
        res.json({ success: true, message: 'Left practice session.' });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to leave practice.' });
      }
    },
  );

  /** POST /api/race/:raceId/strategy/:botId - update strategy */
  router.post(
    '/api/race/:raceId/strategy/:botId',
    requireAuth,
    requireOwnership,
    (req: AuthenticatedRequest, res: Response) => {
      const updates: Partial<Strategy> = req.body || {};
      const strategy = botManager.updateStrategy(req.params.botId, updates);
      res.json({ success: true, strategy });
    },
  );

  /** GET /api/race/:raceId/telemetry/:botId - detailed telemetry */
  router.get(
    '/api/race/:raceId/telemetry/:botId',
    requireAuth,
    requireOwnership,
    (req: AuthenticatedRequest, res: Response) => {
      const telemetry = raceEngine.getTelemetry(req.params.botId);
      if (!telemetry) {
        res.status(404).json({ error: 'No telemetry available for this bot.' });
        return;
      }
      res.json(telemetry);
    },
  );

  /** POST /api/bot/:id/swap-driver - hot-swap driver code (endurance) */
  router.post(
    '/api/bot/:id/swap-driver',
    requireAuth,
    requireOwnership,
    (req: AuthenticatedRequest, res: Response) => {
      const { code } = req.body || {};
      if (!code) {
        res.status(400).json({ error: 'code is required.' });
        return;
      }
      botManager.updateDriverCode(req.params.id, code);
      res.json({ success: true, message: 'Driver code swapped.' });
    },
  );

  return router;
}

export default createRouter;
