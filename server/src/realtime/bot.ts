/**
 * The bot brain lives in `@mini-arcade/shared` so the browser can run the very
 * same opponent offline. This module only re-exports it for the realtime layer.
 */
export {
  BOT_DIFFICULTIES,
  botIdentity,
  decide,
  type BotDecision,
  type BotDifficulty,
} from '@mini-arcade/shared';
