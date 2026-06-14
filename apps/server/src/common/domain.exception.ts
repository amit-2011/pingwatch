import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@pingwatch/shared';

/** An exception that carries an explicit ErrorEnvelope `code` (e.g. SETUP_REQUIRED, INVALID_CREDENTIALS). */
export class DomainException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: number,
  ) {
    super(message, status);
  }
}
