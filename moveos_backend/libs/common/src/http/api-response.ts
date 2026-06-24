import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export type ApiSuccess<T = unknown> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  statusCode: number;
  message: string;
  errorCode?: string;
  details?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toSuccessEnvelope(value: unknown): ApiSuccess {
  if (isRecord(value) && value.ok === true && 'data' in value) {
    return value as ApiSuccess;
  }

  if (isRecord(value) && value.status === 'ok' && 'data' in value) {
    return { ok: true, data: value.data };
  }

  return { ok: true, data: value };
}

export function toErrorEnvelope(exception: unknown): ApiFailure {
  const statusCode =
    exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  const response =
    exception instanceof HttpException ? exception.getResponse() : undefined;

  if (isRecord(response) && response.ok === false) {
    return {
      ok: false,
      statusCode,
      message: normalizeMessage(response.message),
      errorCode: normalizeOptionalString(response.errorCode ?? response.code),
      details: response.details,
    };
  }

  if (isRecord(response)) {
    return {
      ok: false,
      statusCode,
      message: normalizeMessage(response.message ?? response.error),
      errorCode: normalizeOptionalString(response.errorCode ?? response.code ?? response.error),
      details: response.details ?? response,
    };
  }

  if (typeof response === 'string') {
    return {
      ok: false,
      statusCode,
      message: response,
      errorCode: exception instanceof Error ? exception.name : undefined,
    };
  }

  return {
    ok: false,
    statusCode,
    message: exception instanceof Error ? exception.message : 'Internal server error',
    errorCode: exception instanceof Error ? exception.name : undefined,
  };
}

function normalizeMessage(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return typeof value === 'string' && value.trim() ? value : 'Something went wrong';
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiSuccess | unknown> {
    const req = context.switchToHttp().getRequest<{ path?: string; url?: string }>();
    const path = req.path ?? req.url ?? '';
    if (path.startsWith('/api/auth') || path.startsWith('/api/onboarding')) {
      return next.handle();
    }

    return next.handle().pipe(map(toSuccessEnvelope));
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const envelope = toErrorEnvelope(exception);
    response.status(envelope.statusCode).json(envelope);
  }
}
