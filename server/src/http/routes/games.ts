import { Router } from 'express';
import { GAME_LIST } from '@mini-arcade/shared';
import { staticJson } from '../static-json.js';

export const gamesRouter: Router = Router();

// The catalogue is compiled in, so it is serialised once and served from an ETag.
gamesRouter.get('/', staticJson({ items: GAME_LIST, total: GAME_LIST.length }, 300));
