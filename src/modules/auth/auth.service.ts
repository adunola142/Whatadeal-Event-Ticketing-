import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto';
import { DeviceStatus, UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role || UserRole.POS_OPERATOR,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      user,
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.role === UserRole.POS_OPERATOR) {
      await this.verifyTerminal(user.id, dto.deviceSerial);
    }

    if (user.role === UserRole.ORG_ADMIN || user.role === UserRole.EVENT_MANAGER) {
      await this.verifyOrganizationActive(user.id);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      ...tokens,
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive || !user.refreshToken) {
        throw new ForbiddenException('Access denied');
      }

      const tokenMatches = await bcrypt.compare(
        refreshToken,
        user.refreshToken,
      );
      if (!tokenMatches) {
        throw new ForbiddenException('Access denied');
      }

      const tokens = await this.generateTokens(
        user.id,
        user.email,
        user.role,
      );
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return tokens;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return { message: 'Logged out successfully' };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  /**
   * A POS_OPERATOR may only sign in from a terminal that's registered,
   * active, and currently assigned to them — enforced here, server-side,
   * so a login can't be made possible just by skipping a client-side
   * check in a patched build of the app. Rejects (no tokens issued)
   * rather than letting the operator in and only blocking them later at
   * the payment screen.
   */
  private async verifyTerminal(userId: string, deviceSerial?: string) {
    if (!deviceSerial) {
      throw new ForbiddenException(
        'This app must run on a registered terminal — no device serial was provided.',
      );
    }

    const device = await this.prisma.pOSDevice.findUnique({
      where: { serialNumber: deviceSerial },
    });
    if (!device) {
      throw new ForbiddenException(
        'This terminal is not registered. Ask your Super Admin to register it before signing in.',
      );
    }
    if (device.status !== DeviceStatus.ACTIVE) {
      throw new ForbiddenException(
        `This terminal is ${device.status.toLowerCase()} and cannot be used. Contact your admin.`,
      );
    }

    const operator = await this.prisma.pOSOperator.findUnique({
      where: { userId },
    });
    const assignment = operator
      ? await this.prisma.pOSDeviceAssignment.findFirst({
          where: { operatorId: operator.id, deviceId: device.id, isActive: true },
        })
      : null;
    if (!assignment) {
      throw new ForbiddenException(
        'This terminal is not assigned to your account. Contact your admin.',
      );
    }
  }

  /**
   * An ORG_ADMIN or EVENT_MANAGER signs in on behalf of an organization —
   * if every organization they actively belong to has been suspended by
   * Whatadeal, they should not get in either, even though their own
   * account (isActive) is untouched. Checked here, server-side, same as
   * the terminal check above. A user with no active membership at all
   * is left alone — that's a different, pre-existing state, not what
   * this check is for.
   */
  private async verifyOrganizationActive(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, isActive: true },
      include: { organization: { select: { isActive: true } } },
    });

    if (memberships.length === 0) return;

    const hasActiveOrg = memberships.some((m) => m.organization.isActive);
    if (!hasActiveOrg) {
      throw new ForbiddenException(
        'Your organization has been suspended. Contact Whatadeal support.',
      );
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
  ) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: this.configService.get<string>('jwt.expiration'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiration'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedToken = await bcrypt.hash(refreshToken, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedToken },
    });
  }

  // #6 - Change password (authenticated user)
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        refreshToken: null,
        mustChangePassword: false,
      },
    });

    return { message: 'Password changed successfully' };
  }

  // #7 - Forgot password: generate a short-lived reset token
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      this.logger.warn(`Password reset requested for unknown email: ${email}`);
      return { message: 'If an account exists, a reset link has been sent' };
    }

    const resetToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, type: 'password-reset' },
      {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: '15m',
      },
    );

    // TODO: Send reset email via email service
    this.logger.log(
      `Password reset token generated for ${email}: ${resetToken}`,
    );

    return {
      message: 'If an account exists, a reset link has been sent',
      resetToken, // Remove in production
    };
  }

  // #7 - Reset password using token
  async resetPassword(token: string, newPassword: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      if (payload.type !== 'password-reset') {
        throw new UnauthorizedException('Invalid reset token');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid reset token');
      }

      const newHash = await bcrypt.hash(newPassword, 12);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          refreshToken: null,
        },
      });

      return { message: 'Password has been reset successfully' };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired reset token');
    }
  }
}
