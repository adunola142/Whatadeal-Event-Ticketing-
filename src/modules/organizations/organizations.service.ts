import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  AccessScope,
  isPlatformAdmin,
  requireOrgAccess,
} from '../../common/utils/organization-scope';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async create(
    data: {
      name: string;
      description?: string;
      website?: string;
      email?: string;
      phone?: string;
      address?: string;
      admin?: {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
      };
    },
    createdById: string,
  ) {
    if (!data?.name) {
      throw new BadRequestException('Organization name is required');
    }

    const slug = this.generateSlug(data.name);

    const existing = await this.prisma.organization.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new ConflictException('Organization with this name already exists');
    }

    const { admin, ...orgData } = data;

    if (admin) {
      const adminExists = await this.prisma.user.findUnique({
        where: { email: admin.email },
      });
      if (adminExists) {
        throw new ConflictException('Administrator email already registered');
      }
    }

    const passwordHash = admin ? await bcrypt.hash(admin.password, 12) : null;

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: orgData.name,
          slug,
          description: orgData.description,
          website: orgData.website,
          email: orgData.email,
          phone: orgData.phone,
          address: orgData.address,
          createdById,
        },
      });

      if (!admin || !passwordHash) return organization;

      const adminUser = await tx.user.create({
        data: {
          email: admin.email,
          passwordHash,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: UserRole.ORG_ADMIN,
        },
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
      });

      await tx.organizationMember.create({
        data: {
          userId: adminUser.id,
          organizationId: organization.id,
          role: UserRole.ORG_ADMIN,
        },
      });

      return { ...organization, admin: adminUser };
    });
  }

  async findAll(query: { page?: number; limit?: number; search?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { members: true, events: true } },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      data: organizations,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, scope?: AccessScope) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
        _count: { select: { events: true } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    if (scope) await requireOrgAccess(this.prisma, scope, id);
    return org;
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      website?: string;
      email?: string;
      phone?: string;
      address?: string;
    },
    userId: string,
    userRole: UserRole,
  ) {
    const org = await this.findOne(id);

    // Only super admin or org admin can update
    if (userRole !== UserRole.SUPER_ADMIN) {
      const membership = org.members.find((m) => m.userId === userId);
      if (!membership || membership.role !== UserRole.ORG_ADMIN) {
        throw new ForbiddenException('Not authorized to update this organization');
      }
    }

    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }

  async addMember(
    orgId: string,
    data: { userId: string; role: UserRole },
    scope?: AccessScope,
  ) {
    await this.findOne(orgId);
    if (scope) {
      await requireOrgAccess(this.prisma, scope, orgId);
      if (!isPlatformAdmin(scope.role) && data.role === UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Only Whatadeal admins can add super admins');
      }
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: data.userId, organizationId: orgId } },
    });
    if (existing) throw new ConflictException('User is already a member');

    return this.prisma.organizationMember.create({
      data: {
        userId: data.userId,
        organizationId: orgId,
        role: data.role,
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async removeMember(orgId: string, userId: string, scope?: AccessScope) {
    if (scope) await requireOrgAccess(this.prisma, scope, orgId);
    const member = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!member) throw new NotFoundException('Member not found');

    return this.prisma.organizationMember.delete({
      where: { id: member.id },
    });
  }

  async toggleActive(id: string) {
    const org = await this.findOne(id);
    return this.prisma.organization.update({
      where: { id },
      data: { isActive: !org.isActive },
    });
  }

  /**
   * Get organizations a user belongs to
   */
  async findByUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, isActive: true },
      include: {
        organization: true,
      },
    });
    return memberships.map((m) => ({
      ...m.organization,
      memberRole: m.role,
    }));
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
