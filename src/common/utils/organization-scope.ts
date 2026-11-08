import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Organizations the user is an active member of. */
export async function userOrganizationIds(
  prisma: PrismaService,
  userId: string,
): Promise<string[]> {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId, isActive: true },
    select: { organizationId: true },
  });
  return memberships.map((m) => m.organizationId);
}

/** Only Whatadeal super admins see platform-wide data. */
export function isPlatformAdmin(role: UserRole | string | undefined): boolean {
  return role === UserRole.SUPER_ADMIN;
}

export interface AccessScope {
  userId: string;
  role: UserRole;
}

export function scopeOf(userId: string, role: UserRole): AccessScope {
  return { userId, role };
}

/** Throws unless the caller is a Whatadeal admin or an active member of the organization. */
export async function requireOrgAccess(
  prisma: PrismaService,
  scope: AccessScope,
  organizationId: string | undefined | null,
): Promise<void> {
  if (isPlatformAdmin(scope.role)) return;
  if (!organizationId) {
    throw new ForbiddenException('You do not have access to this organization');
  }
  const member = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId: scope.userId, organizationId } },
  });
  if (!member || !member.isActive) {
    throw new ForbiddenException('You do not have access to this organization');
  }
}

/** Loads the event and checks the caller can see it. */
export async function requireEventAccess(
  prisma: PrismaService,
  scope: AccessScope,
  eventId: string,
  opts: { allowAssignedOperator?: boolean } = {},
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizationId: true },
  });
  if (!event) throw new NotFoundException('Event not found');
  if (isPlatformAdmin(scope.role)) return event;
  if (opts.allowAssignedOperator && scope.role === UserRole.POS_OPERATOR) {
    const assignment = await prisma.eventAssignment.findFirst({
      where: { eventId, isActive: true, operator: { userId: scope.userId } },
    });
    if (assignment) return event;
  }
  await requireOrgAccess(prisma, scope, event.organizationId);
  return event;
}

/** A POS operator may access their own transactions; otherwise org membership is required. */
export async function requireTransactionAccess(
  prisma: PrismaService,
  scope: AccessScope,
  tx: { event: { organizationId: string }; operator: { userId: string } },
): Promise<void> {
  if (isPlatformAdmin(scope.role)) return;
  if (scope.role === UserRole.POS_OPERATOR && tx.operator.userId === scope.userId) return;
  await requireOrgAccess(prisma, scope, tx.event.organizationId);
}
