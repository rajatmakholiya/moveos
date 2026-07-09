import { HttpException, Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { RedisService } from '@common/index';
import type { NextFunction, Request, Response } from 'express';

// Fixed-window rate limits (per client IP), Redis-backed so they hold across
// gateway replicas. Overridable via env.
const GLOBAL_LIMIT = Number(process.env.RATE_LIMIT_GLOBAL_PER_MINUTE ?? 300);
const OTP_LIMIT = Number(process.env.RATE_LIMIT_OTP_PER_MINUTE ?? 10);
const WINDOW_SECONDS = 60;

function isOtpRequestPath(path: string): boolean {
  return /\/otp\/request$/.test(path) || /\/send-otp$/.test(path);
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Behind nginx, the client address arrives in X-Forwarded-For.
    const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const ip = forwarded || req.socket.remoteAddress || 'unknown';
    const otpPath = isOtpRequestPath(req.path);
    const limit = otpPath ? OTP_LIMIT : GLOBAL_LIMIT;
    const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
    const key = `ratelimit:${otpPath ? 'otp' : 'global'}:${ip}:${bucket}`;

    try {
      const redis = this.redis.getClient();
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS);
      }
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
      if (count > limit) {
        this.logger.warn(`Rate limit exceeded (${otpPath ? 'otp' : 'global'}) for ${ip} on ${req.path}`);
        throw new HttpException(
          {
            message: 'Too many requests. Please slow down and try again shortly.',
            error_code: 'rate_limited',
            retryAfterSeconds: WINDOW_SECONDS,
          },
          429,
        );
      }
      next();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Redis hiccup must not take the API down — fail open.
      this.logger.warn(`Rate limiter degraded (fail-open): ${(err as Error).message}`);
      next();
    }
  }
}

/** Attach/propagate a request correlation id for log tracing. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = (req.headers['x-request-id'] as string | undefined)?.slice(0, 64);
    const requestId = incoming && /^[\w.-]+$/.test(incoming) ? incoming : `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
