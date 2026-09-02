/** Standard Elo with a rating dependent K factor. */
export const DEFAULT_RATING = 1200;

export function kFactor(rating: number, played: number): number {
  if (played < 10) return 40;
  if (rating >= 2100) return 16;
  if (rating >= 1700) return 24;
  return 32;
}

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export interface RatingInput {
  rating: number;
  played: number;
  /** 1 = win, 0.5 = draw, 0 = loss */
  score: number;
}

export function eloDelta(player: RatingInput, opponent: Pick<RatingInput, 'rating'>): number {
  const expected = expectedScore(player.rating, opponent.rating);
  return Math.round(kFactor(player.rating, player.played) * (player.score - expected));
}
