// The submission checklist: one line per condition the analysis found in the
// tender (its requirements), plus items the user adds. The lines are built
// from the requirements every time, so the checklist can't list anything the
// tender doesn't ask for; only ticks and added items are stored
// (checklist_items). A tick is keyed on the requirement's category and text,
// so it survives a re-analysis that finds the same requirement, and quietly
// stops applying when a re-analysis no longer finds it.
//
// Callers must have confirmed the tender belongs to the scope's company
// (getTender) first, as with the other tender-child repos.

import crypto from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { checklistItems } from '../../db/schema/index.js';
import { listRequirements, listEvidenceForRequirement } from './requirements.js';

export const CUSTOM_LABEL_MAX = 300;

// Documents first, then the rest in a stable order.
const CATEGORY_ORDER = ['DOCUMENT', 'FINANCIAL', 'EXPERIENCE', 'CERTIFICATION', 'LICENSE', 'LEGAL', 'TECHNICAL',
  'MANPOWER', 'EQUIPMENT', 'OEM', 'GEOGRAPHIC', 'SPECIAL_CONDITION', 'OTHER'];

const normalise = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Stable key for a requirement's tick. */
export function requirementKey(requirement) {
  const text = `${requirement.category}|${normalise(requirement.title)}|${normalise(requirement.description)}`;
  return crypto.createHash('sha1').update(text).digest('hex');
}

function labelFor(r) {
  const title = (r.title ?? '').trim();
  if (title) return title;
  const d = r.description.trim();
  return d.length > 140 ? `${d.slice(0, 137)}…` : d;
}

export async function getChecklist(scope, tenderId) {
  const [requirements, rows] = await Promise.all([
    listRequirements(scope, tenderId),
    scope.db.select().from(checklistItems).where(eq(checklistItems.tenderId, tenderId)).orderBy(asc(checklistItems.createdAt)),
  ]);
  const ticks = new Map(rows.filter((r) => r.kind === 'requirement').map((r) => [r.itemKey, r]));
  const seen = new Set();
  const items = [];
  for (const r of requirements) {
    const key = requirementKey(r);
    if (seen.has(key)) continue; // the same condition found twice in one tender
    seen.add(key);
    const evidence = await listEvidenceForRequirement(scope, r.id);
    const tick = ticks.get(key);
    items.push({
      key,
      label: labelFor(r),
      detail: r.title ? r.description : null,
      category: r.category,
      mandatory: r.mandatory,
      sourcePage: evidence.find((e) => e.sourcePage != null)?.sourcePage ?? null,
      done: Boolean(tick?.doneAt),
      doneAt: tick?.doneAt ?? null,
    });
  }
  items.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
  const custom = rows.filter((r) => r.kind === 'custom').map((r) => ({
    id: r.id, label: r.label, done: Boolean(r.doneAt), doneAt: r.doneAt,
  }));
  const total = items.length + custom.length;
  const done = items.filter((i) => i.done).length + custom.filter((c) => c.done).length;
  return { items, custom, total, done };
}

/** Tick or untick a requirement line. Returns false when the key isn't one
 *  of this tender's current requirements. */
export async function setRequirementDone(scope, tenderId, key, done, userId) {
  const requirements = await listRequirements(scope, tenderId);
  if (!requirements.some((r) => requirementKey(r) === key)) return false;
  const now = new Date();
  await scope.db.insert(checklistItems)
    .values({ tenderId, kind: 'requirement', itemKey: key, doneAt: done ? now : null, doneBy: done ? userId : null })
    .onConflictDoUpdate({
      target: [checklistItems.tenderId, checklistItems.itemKey],
      set: { doneAt: done ? now : null, doneBy: done ? userId : null, updatedAt: now },
    });
  return true;
}

export async function addCustomItem(scope, tenderId, label) {
  const [row] = await scope.db.insert(checklistItems)
    .values({ tenderId, kind: 'custom', label })
    .returning();
  return { id: row.id, label: row.label, done: false, doneAt: null };
}

/** Returns false when the item isn't one of this tender's added items. */
export async function setCustomDone(scope, tenderId, itemId, done, userId) {
  const now = new Date();
  const rows = await scope.db.update(checklistItems)
    .set({ doneAt: done ? now : null, doneBy: done ? userId : null, updatedAt: now })
    .where(and(eq(checklistItems.id, itemId), eq(checklistItems.tenderId, tenderId), eq(checklistItems.kind, 'custom')))
    .returning({ id: checklistItems.id });
  return rows.length > 0;
}

export async function deleteCustomItem(scope, tenderId, itemId) {
  const rows = await scope.db.delete(checklistItems)
    .where(and(eq(checklistItems.id, itemId), eq(checklistItems.tenderId, tenderId), eq(checklistItems.kind, 'custom')))
    .returning({ id: checklistItems.id });
  return rows.length > 0;
}
