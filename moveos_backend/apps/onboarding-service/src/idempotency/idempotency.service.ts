import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '@common/index';
import { IdempotencyKey } from '@prisma/client';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {
    // Purge replay records older than 7 days, hourly. Idempotency keys only
    // need to survive client retries, not history.
    const timer = setInterval(() => {
      void this.prisma.idempotencyKey
        .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } })
        .catch(() => undefined);
    }, 60 * 60 * 1000);
    timer.unref?.();
  }

  async replay(key?: string | null): Promise<IdempotencyKey | null> {
    if (!key) return null;
    return this.prisma.idempotencyKey.findUnique({ where: { key } });
  }

  async persist(key: string | undefined, method: string, path: string, statusCode: number, response: any) {
    if (!key) return;
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key,
          method,
          path,
          statusCode,
          response,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return;
      }
      throw new InternalServerErrorException('Failed to persist idempotency key');
    }
  }
}
