export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Not allowed'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string): AppError {
    return new AppError(409, code, message);
  }

  static tooManyRequests(message = 'Too many requests', details?: unknown): AppError {
    return new AppError(429, 'RATE_LIMITED', message, details);
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }

  static unavailable(message = 'Service temporarily unavailable'): AppError {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message);
  }
}
