const { applyDeadStockDecay, scanLowStockAndNotify } = require('../modules/inventory/inventory.service');
const logger = require('../config/logger');

async function processMaintenanceJob(job) {
  logger.info('[maintenance] job', { name: job.name, id: job.id });
  if (job.name === 'dead-stock-decay') {
    return applyDeadStockDecay();
  }
  if (job.name === 'low-stock-scan') {
    return scanLowStockAndNotify();
  }
  throw new Error(`Unknown maintenance job: ${job.name}`);
}

module.exports = { processMaintenanceJob };
