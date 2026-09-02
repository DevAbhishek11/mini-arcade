import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/** Parses and replaces request parts with their validated, typed values. */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query)
        Object.defineProperty(req, 'query', { value: schemas.query.parse(req.query), writable: true });
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
