import 'dotenv/config';
import {
  PrismaClient,
  UserRole,
  LanguageCode,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Super Admin and default subscription plans...');

  const superAdminPasswordHash = await bcrypt.hash('SuperAdmin@123', 10);

  // 1. Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { phone: '9999999999' },
    update: {
      role: UserRole.SUPER_ADMIN,
      name: 'Platform Super Admin',
      email: 'admin@fleetapp.in',
      passwordHash: superAdminPasswordHash,
    },
    create: {
      role: UserRole.SUPER_ADMIN,
      name: 'Platform Super Admin',
      phone: '9999999999',
      email: 'admin@fleetapp.in',
      passwordHash: superAdminPasswordHash,
      language: LanguageCode.en,
    },
  });

  // 2. Default Subscription Plans
  await prisma.subscriptionPlan.upsert({
    where: { slug: 'basic' },
    update: {},
    create: {
      name: 'Basic Fleet',
      slug: 'basic',
      description: 'Essential trip tracking & offline document vault for small owners (up to 3 trucks).',
      priceMonthlyInr: '499.00',
      priceYearlyInr: '4999.00',
      maxTrucks: 3,
      maxDrivers: 5,
      featureOcrVision: false,
      featureFastagAutoSync: false,
      featureEmiTracker: false,
      featureComplianceVault: true,
      featureDriverPermissions: true,
      featureMonthlyAnalytics: false,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { slug: 'growth' },
    update: {},
    create: {
      name: 'Growth Fleet',
      slug: 'growth',
      description: 'Full AI OCR, FASTag auto-sync, EMI tracker, compliance alerts & P&L analytics (up to 15 trucks).',
      priceMonthlyInr: '1499.00',
      priceYearlyInr: '14999.00',
      maxTrucks: 15,
      maxDrivers: 25,
      featureOcrVision: true,
      featureFastagAutoSync: true,
      featureEmiTracker: true,
      featureComplianceVault: true,
      featureDriverPermissions: true,
      featureMonthlyAnalytics: true,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { slug: 'enterprise' },
    update: {},
    create: {
      name: 'Enterprise Fleet',
      slug: 'enterprise',
      description: 'Large transport companies with up to 100 trucks, 200 drivers and all premium automations.',
      priceMonthlyInr: '3999.00',
      priceYearlyInr: '39999.00',
      maxTrucks: 100,
      maxDrivers: 200,
      featureOcrVision: true,
      featureFastagAutoSync: true,
      featureEmiTracker: true,
      featureComplianceVault: true,
      featureDriverPermissions: true,
      featureMonthlyAnalytics: true,
    },
  });

  console.log('Seed completed successfully. Super Admin ready:', superAdmin.phone);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
