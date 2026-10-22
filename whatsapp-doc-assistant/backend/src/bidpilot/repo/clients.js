// A consultant's clients and their profiles (schema/clients.js). Every
// function takes a CompanyScope, so a client is only ever reachable through
// the company that owns it.

import { and, asc, eq } from 'drizzle-orm';
import { clients, clientProfiles } from '../../db/schema/index.js';

export const CLIENT_NAME_MAX = 120;

export async function listClients(scope) {
  return scope.db.select().from(clients).where(eq(clients.companyId, scope.companyId)).orderBy(asc(clients.name));
}

export async function getClient(scope, clientId) {
  return scope.getOwned(clients, clients.id, clients.companyId, clientId);
}

export class ClientNameTakenError extends Error {}

export async function createClient(scope, name) {
  try {
    return await scope.insertOwned(clients, 'companyId', { name });
  } catch (err) {
    if (err?.cause?.code === '23505' || err?.code === '23505') throw new ClientNameTakenError('You already have a client with that name.');
    throw err;
  }
}

export async function renameClient(scope, clientId, name) {
  try {
    return await scope.updateOwned(clients, clients.id, clients.companyId, clientId, { name, updatedAt: new Date() });
  } catch (err) {
    if (err?.cause?.code === '23505' || err?.code === '23505') throw new ClientNameTakenError('You already have a client with that name.');
    throw err;
  }
}

/** Deletes the client and its profile; its tenders stay, marked as the
 *  company's own (tenders.client_id is set null by the foreign key). */
export async function deleteClient(scope, clientId) {
  const rows = await scope.db.delete(clients)
    .where(and(eq(clients.id, clientId), eq(clients.companyId, scope.companyId)))
    .returning({ id: clients.id });
  return rows.length > 0;
}

export async function getClientProfile(scope, clientId) {
  const [row] = await scope.db.select().from(clientProfiles)
    .where(and(eq(clientProfiles.clientId, clientId), eq(clientProfiles.companyId, scope.companyId)))
    .limit(1);
  return row;
}

export async function upsertClientProfile(scope, clientId, fields) {
  const existing = await getClientProfile(scope, clientId);
  if (existing) {
    const [row] = await scope.db.update(clientProfiles)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(clientProfiles.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await scope.db.insert(clientProfiles)
    .values({ ...fields, clientId, companyId: scope.companyId })
    .returning();
  return row;
}
