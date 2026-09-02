import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * Handler for a payload that never changes while the process is alive (game
 * catalogues, achievement definitions, …).
 *
 * The body is serialised exactly once at startup and hashed into a strong
 * ETag, so each request costs a header compare instead of a fresh
 * `JSON.stringify` of the whole catalogue, and repeat visitors get a 304 with
 * no body at all.
 */
export function staticJson(payload: unknown, maxAgeSeconds: number) {
  const body = JSON.stringify(payload);
  const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;

  return (req: Request, res: Response): void => {
    res.setHeader('etag', etag);
    res.setHeader('cache-control', `public, max-age=${maxAgeSeconds}`);

    // `If-None-Match` may carry a list, and proxies can weaken the tag.
    const requested = req.headers['if-none-match'];
    if (requested && requested.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag)) {
      res.status(304).end();
      return;
    }

    res.type('application/json').send(body);
  };
}
