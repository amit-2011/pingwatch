import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ZodValidationException } from './validation.exception';

/**
 * Validates a request payload against a zod schema from @pingwatch/shared (we use zod, not
 * class-validator). Usage: `@Body(new ZodValidationPipe(createMonitorSchema)) dto`.
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ZodValidationException(result.error.issues);
    }
    return result.data;
  }
}
