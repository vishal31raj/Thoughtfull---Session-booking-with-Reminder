export function findAppError(error: unknown): AppError | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    if (current instanceof AppError) return current;
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
