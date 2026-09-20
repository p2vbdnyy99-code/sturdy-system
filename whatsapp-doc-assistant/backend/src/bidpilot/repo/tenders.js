// Tender CRUD — every function takes a CompanyScope (see repo/tenants.js), not
// a bare companyId, so it's structurally impossible to call these without
// having first proven the caller belongs to that company.

import { tenders } from '../../db/schema/index.js';

export async function createTender(scope, fields) {
  return scope.insertOwned(tenders, 'companyId', fields);
}

export async function getTender(scope, tenderId) {
  return scope.getOwned(tenders, tenders.id, tenders.companyId, tenderId);
}

export async function listTenders(scope) {
  return scope.listOwned(tenders, tenders.companyId);
}

export async function updateTenderStatus(scope, tenderId, status) {
  return scope.updateOwned(tenders, tenders.id, tenders.companyId, tenderId, {
    status,
    updatedAt: new Date(),
  });
}

export async function updateProcessingStatus(scope, tenderId, processingStatus, processingError = null) {
  return scope.updateOwned(tenders, tenders.id, tenders.companyId, tenderId, {
    processingStatus,
    processingError,
    updatedAt: new Date(),
  });
}
