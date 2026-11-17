import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';

/** Endpoints a user may call while they still have to change a temporary password. */
const PASSWORD_CHANGE_EXEMPT = [
  '/api/v1/auth/change-password',
  '/api/v1/auth/logout',
  '/api/v1/users/me',
];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const authenticated = await super.canActivate(context);
    if (!authenticated) return false;

    const req = context.switchToHttp().getRequest();
    const url: string = (req.originalUrl ?? req.url ?? '').split('?')[0];
    if (
      req.user?.mustChangePassword &&
      !PASSWORD_CHANGE_EXEMPT.some((p) => url === p || url.startsWith(p + '/'))
    ) {
      throw new ForbiddenException('Password change required');
    }
    return true;
  }
}
