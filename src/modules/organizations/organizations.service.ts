import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

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

    return this.prisma.organization.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        website: data.website,
        email: data.email,
        phone: data.phone,
        address: data.address,
        createdById,
      },
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

  async findOne(id: string) {
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
  ) {
    await this.findOne(orgId);

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

  async removeMember(orgId: string, userId: string) {
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
