// Annexure drafts: finding the tender's formats, keeping a draft to the
// tender's own words, filling it only from the profile, and the routes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import JSZip from 'jszip';
import { findFormats, formatSource, validateDraft, DRAFT_FIELDS } from '../../src/bidpilot/analysis/annexures.js';
import { buildAnnexureDocx, draftValues, draftCoverage } from '../../src/bidpilot/annexureDocx.js';
import { checkLetterhead } from '../../src/bidpilot/letterhead.js';
import { missingProfileFields } from '../../src/bidpilot/profileCompleteness.js';
import { setProvider } from '../../src/ai/index.js';
import { dbAvailable, DB_URL, testDb, closeTestDb, truncateAll } from '../db/helpers.js';
import { createCompanyWithOwner, upsertCompanyProfile } from '../../src/bidpilot/repo/companies.js';
import { requireCompanyAccess } from '../../src/bidpilot/repo/tenants.js';
import { createTender } from '../../src/bidpilot/repo/tenders.js';
import { insertPages } from '../../src/bidpilot/repo/pages.js';
import { createClient, upsertClientProfile } from '../../src/bidpilot/repo/clients.js';
import { setDb, closeDb } from '../../src/db/client.js';
import { createSession } from '../../src/bidpilot/auth/sessionService.js';
import { csrfTokenFor } from '../../src/bidpilot/auth/csrf.js';
import { cookieParserMiddleware, SESSION_COOKIE_NAME } from '../../src/bidpilot/auth/cookies.js';
import { createTendersRouter } from '../../src/bidpilot/routes/tenders.js';
import { createCompaniesRouter } from '../../src/bidpilot/routes/companies.js';

// From a real SBI tender's Annexure-A (pages 9-10), shortened.
const UNDERTAKING = `ANNEXURE-A
UNDERTAKING
(The bidders are required to print this on their company's letter head and sign, stamp and upload with technical
Bid)
REGIONAL BUSINESS OFFICE-2,
A-98 B, SECTOR-51, NOIDA -201301,
Dear Sir,
1.   I/ We refer to the tender notice issued by you for CIVIL & PLUMBING works in connection with the above.
2.   I undertake to submit in Hard copy the tender document along with all terms & Conditions, Specifications
and subsequent annexure and corrigendum’s duly signed and stamped by authorized representative/
signatory on becoming L1.
Name of the bidder: ............................
Address: ...........................................
Date: ..........  Place: ..........
Contractor’s Signature & Stamp`;
const PAGES = [
  { pageNumber: 1, rawText: 'NOTICE INVITING TENDER\nSBI invites sealed tenders for civil works. EMD Rs 50,000.' },
  { pageNumber: 2, rawText: '1. Annexure A must be signed. Form of tender is at page 3.\nThe bidder shall quote rates.' },
  { pageNumber: 3, rawText: UNDERTAKING },
  { pageNumber: 4, rawText: 'Seal of the bidder ........ continued undertaking text\nSignature ________' },
  { pageNumber: 5, rawText: 'ANNEXURE - 3\nBILL OF QUANTITIES (BOQ)\nItem | Qty | Rate ........' },
  { pageNumber: 6, rawText: 'FORM OF TENDER\nTo\nThe Regional Manager\nI/We ................ hereby tender for the work.\nSignature of the tenderer' },
  { pageNumber: 7, rawText: 'ANNEXURE-5\nMaster plan of the campus\n(drawing)' },
  { pageNumber: 8, rawText: 'SPECIAL CONDITIONS\nThe contractor shall arrange water.' },
];

const GOOD_REPLY = {
  title: 'ANNEXURE-A UNDERTAKING',
  blocks: [
    { text: 'Dear Sir,' },
    { text: 'I/ We refer to the tender notice issued by you for CIVIL & PLUMBING works in connection with the above.' },
    { text: 'Name of the bidder: {{field:companyName}}' },
    { text: 'Address: {{field:registeredAddress}}' },
    { text: 'Date: {{blank:Date}} Place: {{blank:Place}}' },
    // Not in the tender: an invented sentence and an invented PAN.
    { text: 'We have completed 25 similar works for the State Bank of India in the last five years.' },
    { text: 'PAN: ABCDE1234F' },
    // An unknown field becomes a plain blank.
    { text: 'Contractor’s Signature & Stamp {{field:bankAccount}}' },
  ],
};

test('formats: the tender\'s own annexures and forms, never a BOQ, map or the notice', () => {
  const formats = findFormats(PAGES);
  assert.deepEqual(formats.map((f) => [f.key, f.pages, f.title]), [
    [3, [3, 4], 'ANNEXURE-A · UNDERTAKING'],
    [6, [6], 'FORM OF TENDER'],
  ]);
  const source = formatSource(PAGES, formats[0]);
  assert.match(source, /--- page 3 ---/);
  assert.match(source, /--- page 4 ---/);
});

test('a draft keeps only the tender\'s own wording, and unknown fields become blanks', () => {
  const source = formatSource(PAGES, findFormats(PAGES)[0]);
  const checked = validateDraft(GOOD_REPLY, source);
  assert.equal(checked.dropped, 2, 'the invented sentence and the invented PAN');
  const texts = checked.blocks.map((b) => b.text);
  assert.ok(!texts.some((t) => /25 similar works|ABCDE1234F/.test(t)));
  assert.ok(texts.includes('Name of the bidder: {{field:companyName}}'));
  assert.ok(texts.includes('Contractor’s Signature & Stamp {{blank:To fill}}'));
  assert.equal(validateDraft(null, source).blocks.length, 0);
  assert.equal(validateDraft({ blocks: 'nope' }, source).blocks.length, 0);
});

test('the Word file fills only from the profile and marks everything else to fill', async () => {
  const blocks = validateDraft(GOOD_REPLY, formatSource(PAGES, findFormats(PAGES)[0])).blocks;
  const values = draftValues({ registeredAddress: null, pan: 'ABCDE1234F', annualTurnover: '25000000' }, 'Skyline Builders');
  assert.deepEqual(values, { companyName: 'Skyline Builders', pan: 'ABCDE1234F', annualTurnover: '₹2,50,00,000' });
  assert.deepEqual(draftCoverage(blocks, values), { fieldsUsed: ['companyName', 'registeredAddress'], missing: ['registeredAddress'], missingLabels: ['Registered address'], blanks: 3 });
  const buf = await buildAnnexureDocx({ title: 'ANNEXURE-A · UNDERTAKING', tenderTitle: 'sbi civil', pages: [3, 4], blocks, values, bidderName: 'Skyline Builders', today: '16 October 2026' });
  const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
  const text = xml.replace(/<[^>]+>/g, '');
  assert.match(text, /Skyline Builders/);
  assert.match(text, /\[to fill: Registered address\]/);
  assert.match(text, /\[to fill: Date\]/);
  assert.match(text, /pages 3–4/);
  assert.ok(!text.includes('ABCDE1234F'), 'the PAN is in the profile but this format never asked for it');
  assert.match(xml, /w:highlight w:val="yellow"/);
});

test('letterhead details: optional, tidied and checked; never needed for a complete profile', () => {
  assert.deepEqual(checkLetterhead({ pan: ' abcde1234f ', contactEmail: '', industry: 'civil' }).fields, { pan: 'ABCDE1234F', contactEmail: null, industry: 'civil' });
  assert.match(checkLetterhead({ pan: 'ABC123' }).error, /10 characters/);
  assert.match(checkLetterhead({ contactEmail: 'not-an-email' }).error, /email/);
  assert.match(checkLetterhead({ contactPhone: 'call me' }).error, /digits/);
  assert.match(checkLetterhead({ registeredAddress: 'x'.repeat(401) }).error, /under 400/);
  assert.equal(checkLetterhead({ registeredAddress: 'Plot 4,\nMIDC Andheri' }).fields.registeredAddress, 'Plot 4,\nMIDC Andheri', 'address lines kept');
  for (const k of ['registeredAddress', 'pan', 'signatoryName', 'signatoryDesignation', 'contactPhone', 'contactEmail']) {
    assert.ok(!missingProfileFields(null).includes(k), `${k} is not a required field`);
  }
  assert.ok(Object.keys(DRAFT_FIELDS).includes('signatoryName'));
});

const SKIP_REASON = !dbAvailable()
  ? 'DATABASE_URL not set'
  : !process.env.BIDPILOT_CSRF_SECRET
    ? 'BIDPILOT_CSRF_SECRET not set — required for HTTP tests'
    : false;

test('annexure routes (HTTP)', { skip: SKIP_REASON }, async (t) => {
  const db = testDb();
  let server; let baseUrl; let company; let user; let auth; let scope; let tender;
  let aiCalls = 0;
  let reply = GOOD_REPLY;

  t.before(async () => {
    setDb(new pg.Pool({ connectionString: DB_URL, max: 3 }));
    setProvider({ complete: async () => { aiCalls += 1; return JSON.stringify(reply); } });
    const app = express();
    app.use(express.json());
    app.use('/bidpilot', cookieParserMiddleware);
    app.use('/bidpilot', createTendersRouter());
    app.use('/bidpilot', createCompaniesRouter());
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  t.after(async () => {
    await new Promise((r) => server.close(r));
    await closeDb();
    await closeTestDb();
  });
  t.beforeEach(async () => {
    await truncateAll();
    aiCalls = 0;
    reply = GOOD_REPLY;
    const a = await createCompanyWithOwner(db, { companyName: 'Skyline Builders', userEmail: 'sky@example.com', userName: 'S' });
    company = a.company; user = a.user;
    const { rawToken, session } = await createSession(db, user.id);
    auth = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    scope = await requireCompanyAccess(db, { userId: user.id, companyId: company.id });
    tender = await createTender(scope, { title: 'sbi_civil.pdf' });
    await insertPages(scope, tender.id, PAGES);
  });

  function req(method, path, body, who = auth) {
    return new Promise((resolve, reject) => {
      const payload = body ? Buffer.from(JSON.stringify(body)) : null;
      const headers = {
        cookie: `${SESSION_COOKIE_NAME}=${who.cookie}`, 'x-csrf-token': who.csrf,
        ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
      };
      const r = http.request(`${baseUrl}${path}`, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let json; try { json = JSON.parse(buf.toString('utf8')); } catch { json = undefined; }
          resolve({ status: res.statusCode, json, buf, headers: res.headers });
        });
      });
      r.on('error', reject);
      if (payload) r.write(payload);
      r.end();
    });
  }
  const base = () => `/bidpilot/tenders/${tender.id}/annexures`;
  const docText = async (buf) => (await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, '');

  await t.test('list formats, draft one, download it filled from the company profile', async () => {
    await upsertCompanyProfile(db, company.id, { registeredAddress: 'Plot 4, MIDC, Andheri East, Mumbai 400093' });
    const list = await req('GET', `${base()}?companyId=${company.id}`);
    assert.deepEqual(list.json.formats.map((f) => [f.key, f.title, f.draft]), [[3, 'ANNEXURE-A · UNDERTAKING', null], [6, 'FORM OF TENDER', null]]);
    assert.deepEqual(list.json.bidder, { name: 'Skyline Builders', isClient: false });
    assert.equal((await req('GET', `${base()}/3/docx?companyId=${company.id}`)).status, 404, 'nothing to download before drafting');

    const drafted = await req('POST', `${base()}/3/draft`, { companyId: company.id });
    assert.equal(drafted.status, 200);
    assert.equal(drafted.json.dropped, 2);
    assert.deepEqual(drafted.json.draft.missing, []);
    assert.equal(drafted.json.draft.filled, 2);
    assert.equal(aiCalls, 1);

    const file = await req('GET', `${base()}/3/docx?companyId=${company.id}`);
    assert.equal(file.status, 200);
    assert.match(file.headers['content-type'], /wordprocessingml/);
    assert.match(file.headers['content-disposition'], /ANNEXURE-A-draft\.docx/);
    const text = await docText(file.buf);
    assert.match(text, /Name of the bidder: Skyline Builders/);
    assert.match(text, /Plot 4, MIDC, Andheri East/);
    assert.ok(!/25 similar works/.test(text));

    // The profile changes; the next download uses it without drafting again.
    await upsertCompanyProfile(db, company.id, { registeredAddress: null });
    assert.match(await docText((await req('GET', `${base()}/3/docx?companyId=${company.id}`)).buf), /\[to fill: Registered address\]/);
    assert.deepEqual((await req('GET', `${base()}?companyId=${company.id}`)).json.formats[0].draft.missing, ['Registered address']);
    assert.equal(aiCalls, 1);
  });

  await t.test('a client\'s tender is filled from the client\'s profile', async () => {
    const client = await createClient(scope, 'Ganesh Electricals');
    await upsertClientProfile(scope, client.id, { registeredAddress: 'Shop 12, Pune' });
    await req('PATCH', `/bidpilot/tenders/${tender.id}`, { companyId: company.id, clientId: client.id });
    await req('POST', `${base()}/3/draft`, { companyId: company.id });
    const text = await docText((await req('GET', `${base()}/3/docx?companyId=${company.id}`)).buf);
    assert.match(text, /Name of the bidder: Ganesh Electricals/);
    assert.match(text, /Shop 12, Pune/);
    assert.ok(!text.includes('Skyline'));
  });

  await t.test('a reply with nothing from the tender is refused; unknown formats 404; the daily limit gives 429', async () => {
    reply = { blocks: [{ text: 'We are the best contractor in India and will win this bid.' }] };
    const bad = await req('POST', `${base()}/3/draft`, { companyId: company.id });
    assert.equal(bad.status, 502);
    assert.match(bad.json.error, /didn’t match/);
    assert.equal((await req('POST', `${base()}/8/draft`, { companyId: company.id })).status, 404);
    reply = GOOD_REPLY;
    await db.execute(`insert into usage_records (company_id, tender_id, kind, quantity) select '${company.id}', '${tender.id}', 'tender_annexure_draft', 30`);
    const capped = await req('POST', `${base()}/3/draft`, { companyId: company.id });
    assert.equal(capped.status, 429);
    assert.match(capped.json.error, /30\/30/);
  });

  await t.test('another company can\'t list, draft or download', async () => {
    await req('POST', `${base()}/3/draft`, { companyId: company.id });
    const b = await createCompanyWithOwner(db, { companyName: 'Other Co', userEmail: 'other@example.com', userName: 'O' });
    const { rawToken, session } = await createSession(db, b.user.id);
    const other = { cookie: rawToken, csrf: csrfTokenFor(session.tokenHash) };
    assert.equal((await req('GET', `${base()}?companyId=${company.id}`, null, other)).status, 403);
    assert.equal((await req('GET', `${base()}?companyId=${b.company.id}`, null, other)).status, 404);
    assert.equal((await req('GET', `${base()}/3/docx?companyId=${b.company.id}`, null, other)).status, 404);
    assert.equal((await req('POST', `${base()}/3/draft`, { companyId: b.company.id }, other)).status, 404);
  });

  await t.test('letterhead details save on the profile and are checked', async () => {
    const ok = await req('PATCH', `/bidpilot/companies/${company.id}/profile`, { pan: 'abcde1234f', signatoryName: 'Ravi Kumar' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.pan, 'ABCDE1234F');
    assert.equal(ok.json.signatoryName, 'Ravi Kumar');
    assert.equal((await req('PATCH', `/bidpilot/companies/${company.id}/profile`, { pan: 'nope' })).status, 400);
    assert.ok(ok.json.missing.length > 0, 'letterhead alone does not complete a profile');
    assert.ok(!ok.json.missing.includes('pan'));
  });
});
