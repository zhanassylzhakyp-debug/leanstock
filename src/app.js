require('./config/env'); // Validate env first — will exit if missing vars

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./modules/auth/auth.routes');
const tenantRoutes = require('./modules/tenants/tenants.routes');
const productRoutes = require('./modules/products/products.routes');
const locationRoutes = require('./modules/locations/locations.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const forecastRoutes = require('./modules/forecast/forecast.routes');
const reservationRoutes = require('./modules/reservations/reservations.routes');
const supplierRoutes = require('./modules/suppliers/suppliers.routes');
const purchaseOrderRoutes = require('./modules/purchase-orders/purchase-orders.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const decayRulesRoutes = require('./modules/admin/decay-rules.routes');

const env = require('./config/env');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/docs.json', (req, res) => res.json(swaggerSpec));

app.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.use('/api/v1', apiLimiter);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tenants', tenantRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/inventory/forecast', forecastRoutes);
app.use('/api/v1/reservations', reservationRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/purchase-orders', purchaseOrderRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin', decayRulesRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: `Route ${req.method} ${req.path} not found` },
  });
});

app.use(errorHandler);

module.exports = app;
