import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';

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

    // NOTE: this guard no longer blocks requests when mustChangePassword is
    // set. The backend still issues/flags temporary passwords (see
    // users.service.ts, organizations.service.ts), but nothing in the POS
    // app yet has a change-password screen to act on that flag, so
    // enforcing it here locked operators out of every endpoint with no way
    // to resolve it. Re-enable the block once the POS app has that screen.
    return super.canActivate(context) as Promise<boolean>;
  }
}
