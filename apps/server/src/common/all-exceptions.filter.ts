import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import type { ErrorCode, ErrorEnvelope } from '@pingwatch/shared';
import { ZodValidationException } from './validation.exception';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

/**
 * Maps every thrown error to the single ErrorEnvelope `{ code, message, details? }` (PLAN §6.8)
 * that @pingwatch/shared types and the frontend consumes. Internal errors never leak their message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let envelope: ErrorEnvelope = { code: 'INTERNAL', message: 'Internal server error' };

    if (exception instanceof ZodValidationException) {
      status = HttpStatus.BAD_REQUEST;
      envelope = { code: 'VALIDATION_ERROR', message: 'Validation failed', details: exception.issues };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const rawMessage =
        typeof body === 'string' ? body : (body as { message?: unknown }).message;
      const message =
        typeof rawMessage === 'string'
          ? rawMessage
          : Array.isArray(rawMessage)
            ? rawMessage.join(', ')
            : exception.message;
      envelope = { code: STATUS_TO_CODE[status] ?? 'INTERNAL', message };
    }

    res.status(status).json(envelope);
  }
}
