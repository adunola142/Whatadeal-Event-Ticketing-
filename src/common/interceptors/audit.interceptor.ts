import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditLogsService } from '../../modules/audit-logs/audit-logs.service';

const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];
const SKIP_PREFIXES = ['/api/v1/auth/login', '/api/v1/auth/refresh'];

/**
 * Records every successful write request in the audit log.
 * Only the route, record ID and actor are stored; request bodies are not,
 * so passwords and other sensitive values never reach the audit table.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(private audit: AuditLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;
    const url: string = (req.originalUrl ?? req.url ?? '').split('?')[0];

    if (!MUTATING.includes(method) || SKIP_PREFIXES.some((p) => url.startsWith(p))) {
      return next.handle();
    }

    const routePath: string = req.route?.path ?? url;
    const segments = url.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);
    const entity = segments[0] ?? 'unknown';
    const entityId = req.params?.id ?? req.params?.ref ?? req.params?.transactionRef ?? undefined;

    return next.handle().pipe(
      tap({
        next: () => {
          this.audit
            .create({
              action: `${method} ${routePath}`,
              entity,
              entityId: entityId ? String(entityId) : undefined,
              userId: req.user?.id,
              ipAddress: req.ip,
              userAgent: req.headers?.['user-agent'],
            })
            .catch((err) => this.logger.warn(`Audit write failed: ${err?.message}`));
        },
      }),
    );
  }
}
