import { HttpException, HttpStatus } from '@nestjs/common';
import type { ZodIssue } from 'zod';

/** Raised by ZodValidationPipe; the global filter renders it as a VALIDATION_ERROR envelope. */
export class ZodValidationException extends HttpException {
  constructor(public readonly issues: ZodIssue[]) {
    super('Validation failed', HttpStatus.BAD_REQUEST);
  }
}
