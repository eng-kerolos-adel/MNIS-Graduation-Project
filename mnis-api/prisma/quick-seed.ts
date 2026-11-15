import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@mnis.gov.eg';
  const passwordHash = await argon2.hash('12345678');

  // Create an Admin
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: passwordHash,
      role: 'ADMIN',
      fullNameEn: 'System Admin',
      fullNameAr: 'مدير النظام',
    },
  });

  console.log('✅ Admin user created:');
  console.log('Email:', admin.email);
  console.log('Password: 12345678');

  // Create a Receptionist (to test adding citizens)
  const receptionEmail = 'reception@mnis.gov.eg';
  const receptionist = await prisma.user.upsert({
    where: { email: receptionEmail },
    update: {},
    create: {
      email: receptionEmail,
      passwordHash: passwordHash,
      role: 'RECEPTIONIST',
      fullNameEn: 'Main Receptionist',
      fullNameAr: 'موظف الاستقبال',
    },
  });

  console.log('\n✅ Receptionist user created:');
  console.log('Email:', receptionist.email);
  console.log('Password: 12345678');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
