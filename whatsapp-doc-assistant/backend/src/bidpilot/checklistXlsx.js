// The submission checklist as an Excel workbook, for a consultant to share
// with a client or work through offline. Same data as GET .../checklist.
import ExcelJS from 'exceljs';

const CATEGORY_LABELS = {
  DOCUMENT: 'Document', FINANCIAL: 'Financial', EXPERIENCE: 'Experience', CERTIFICATION: 'Certification',
  LICENSE: 'Licence', LEGAL: 'Legal', TECHNICAL: 'Technical', MANPOWER: 'Manpower', EQUIPMENT: 'Equipment',
  OEM: 'OEM', GEOGRAPHIC: 'Location', SPECIAL_CONDITION: 'Special condition', OTHER: 'Other',
};

/** @returns {Promise<Buffer>} */
export async function buildChecklistXlsx({ tender, checklist, deadline }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TenderTez';
  wb.created = new Date();
  const ws = wb.addWorksheet('Checklist');
  ws.columns = [
    { key: 'n', width: 5 }, { key: 'item', width: 60 }, { key: 'category', width: 18 },
    { key: 'mandatory', width: 11 }, { key: 'page', width: 7 }, { key: 'ready', width: 9 },
  ];
  const info = [
    ['Tender', tender.title ?? ''],
    ['Reference', tender.tenderNumber ?? ''],
    ['Organisation', tender.organization ?? ''],
    ['Submission deadline', deadline ?? 'Not found in the document'],
    ['Ready', `${checklist.done} of ${checklist.total}`],
  ];
  for (const [k, v] of info) {
    const row = ws.addRow([k, v]);
    row.getCell(1).font = { bold: true };
  }
  ws.addRow([]);
  const header = ws.addRow(['#', 'Item', 'Category', 'Mandatory', 'Page', 'Ready']);
  header.font = { bold: true };
  let n = 0;
  for (const i of checklist.items) {
    n += 1;
    const row = ws.addRow([n, i.detail ? `${i.label}: ${i.detail}` : i.label, CATEGORY_LABELS[i.category] ?? i.category,
      i.mandatory ? 'Yes' : 'No', i.sourcePage ?? '', i.done ? 'Yes' : '']);
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }
  for (const c of checklist.custom) {
    n += 1;
    ws.addRow([n, c.label, 'Added by you', '', '', c.done ? 'Yes' : '']);
  }
  ws.addRow([]);
  ws.addRow(['', 'Built from the tender document by TenderTez. Check the original document before you bid.']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
