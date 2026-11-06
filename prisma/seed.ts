import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Super Admin (Whatadeal)
  const passwordHash = await bcrypt.hash('WhataDeal@2024!', 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@whatadeal.events' },
    update: {},
    create: {
      email: 'admin@whatadeal.events',
      passwordHash,
      firstName: 'Whatadeal',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      emailVerified: true,
    },
  });

  console.log(`Super Admin created: ${superAdmin.email} (${superAdmin.id})`);

  // Create a demo organization
  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'demo-events' },
    update: {},
    create: {
      name: 'Demo Events',
      slug: 'demo-events',
      description: 'Demo organization for testing',
      email: 'demo@whatadeal.events',
      createdById: superAdmin.id,
    },
  });

  console.log(`Demo org created: ${demoOrg.name} (${demoOrg.id})`);

  // Create an Org Admin
  const orgAdminHash = await bcrypt.hash('OrgAdmin@2024!', 12);
  const orgAdmin = await prisma.user.upsert({
    where: { email: 'orgadmin@demo.com' },
    update: {},
    create: {
      email: 'orgadmin@demo.com',
      passwordHash: orgAdminHash,
      firstName: 'Demo',
      lastName: 'OrgAdmin',
      role: UserRole.ORG_ADMIN,
      isActive: true,
      emailVerified: true,
    },
  });

  // Add org admin as member
  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: {
        userId: orgAdmin.id,
        organizationId: demoOrg.id,
      },
    },
    update: {},
    create: {
      userId: orgAdmin.id,
      organizationId: demoOrg.id,
      role: UserRole.ORG_ADMIN,
    },
  });

  console.log(`Org Admin created: ${orgAdmin.email}`);

  // Create a POS Operator
  const operatorHash = await bcrypt.hash('Operator@2024!', 12);
  const operatorUser = await prisma.user.upsert({
    where: { email: 'operator@whatadeal.events' },
    update: {},
    create: {
      email: 'operator@whatadeal.events',
      passwordHash: operatorHash,
      firstName: 'Demo',
      lastName: 'Operator',
      role: UserRole.POS_OPERATOR,
      isActive: true,
      emailVerified: true,
    },
  });

  await prisma.pOSOperator.upsert({
    where: { userId: operatorUser.id },
    update: {},
    create: {
      userId: operatorUser.id,
      employeeId: 'EMP-001',
    },
  });

  console.log(`POS Operator created: ${operatorUser.email}`);
  console.log('\nSeed completed!');
  console.log('\nLogin credentials:');
  console.log('  Super Admin: admin@whatadeal.events / WhataDeal@2024!');
  console.log('  Org Admin:   orgadmin@demo.com / OrgAdmin@2024!');
  console.log('  Operator:    operator@whatadeal.events / Operator@2024!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
