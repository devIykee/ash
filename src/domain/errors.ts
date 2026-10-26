export class AshError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AshError";
    this.code = code;
    this.status = status;
  }
}

export function isAshError(error: unknown): error is AshError {
  return error instanceof AshError;
}
