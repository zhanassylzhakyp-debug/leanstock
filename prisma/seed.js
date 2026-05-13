const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create tenants
  const tenant1 = await prisma.tenant.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: { name: 'Acme Corp', slug: 'acme-corp' },
  });

  const tenant2 = await prisma.tenant.upsert({
    where: { slug: 'beta-logistics' },
    update: {},
    create: { name: 'Beta Logistics', slug: 'beta-logistics' },
  });

  console.log('✅ Tenants created:', tenant1.name, tenant2.name);

  // Create admin user for tenant1
  const adminHash = await argon2.hash('Admin1234');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: { emailVerifiedAt: new Date() },
    create: {
      email: 'admin@acme.com',
      username: 'acme_admin',
      passwordHash: adminHash,
      role: 'ADMIN',
      tenantId: tenant1.id,
      emailVerifiedAt: new Date(),
    },
  });

  // Create regular user for tenant1
  const userHash = await argon2.hash('User1234');
  const user = await prisma.user.upsert({
    where: { email: 'user@acme.com' },
    update: { emailVerifiedAt: new Date() },
    create: {
      email: 'user@acme.com',
      username: 'acme_user',
      passwordHash: userHash,
      role: 'USER',
      tenantId: tenant1.id,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('✅ Users created: admin@acme.com / Admin1234, user@acme.com / User1234');

  // Create locations for tenant1
  const warehouseA = await prisma.location.upsert({
    where: { name_tenantId: { name: 'Warehouse A', tenantId: tenant1.id } },
    update: {},
    create: { name: 'Warehouse A', address: '123 Main St', tenantId: tenant1.id },
  });
  const storeB = await prisma.location.upsert({
    where: { name_tenantId: { name: 'Store B', tenantId: tenant1.id } },
    update: {},
    create: { name: 'Store B', address: '456 High St', tenantId: tenant1.id },
  });

  // Create products
  const product1 = await prisma.product.upsert({
    where: { sku_tenantId: { sku: 'WIDGET-001', tenantId: tenant1.id } },
    update: {},
    create: {
      sku: 'WIDGET-001',
      name: 'Super Widget',
      price: 29.99,
      costPrice: 12.0,
      tenantId: tenant1.id,
    },
  });

  const product2 = await prisma.product.upsert({
    where: { sku_tenantId: { sku: 'GADGET-002', tenantId: tenant1.id } },
    update: {},
    create: {
      sku: 'GADGET-002',
      name: 'Mega Gadget',
      price: 79.99,
      costPrice: 35.0,
      tenantId: tenant1.id,
    },
  });

  // Set inventory
  await prisma.inventory.upsert({
    where: { productId_locationId: { productId: product1.id, locationId: warehouseA.id } },
    update: {},
    create: { productId: product1.id, locationId: warehouseA.id, quantity: 200 },
  });
  await prisma.inventory.upsert({
    where: { productId_locationId: { productId: product2.id, locationId: warehouseA.id } },
    update: {},
    create: { productId: product2.id, locationId: warehouseA.id, quantity: 50, minQuantity: 60 },
  });
  await prisma.inventory.upsert({
    where: { productId_locationId: { productId: product1.id, locationId: storeB.id } },
    update: {},
    create: { productId: product1.id, locationId: storeB.id, quantity: 30 },
  });

  console.log('✅ Products and inventory seeded');
  console.log('\n📋 Tenant IDs for Postman:');
  console.log('  Acme Corp:', tenant1.id);
  console.log('  Beta Logistics:', tenant2.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
