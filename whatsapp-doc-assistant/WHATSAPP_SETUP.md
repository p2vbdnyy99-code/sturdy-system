# Papyr — WhatsApp number setup (and the SMB trap)

How to get a **real, branded** WhatsApp number sending and receiving through the
Cloud API — and how to dig out of the one hole that ate most of the setup time.
Written from the actual go-live, so future-you never re-lives it.

> **Nothing here is a secret.** Phone Number IDs and WABA IDs are safe to write
> down and commit. The only secret is `WHATSAPP_TOKEN` (the System User token) —
> that lives in Render env vars and nowhere else. Never paste it into a file,
> a commit, or a log.

---

## The one trap: SMB track vs. Cloud API track

A WhatsApp number can be attached to Meta in **two mutually incompatible ways**,
and the console does almost nothing to tell you which one you're on:

| Track | What it is | Symptom when wrong |
|---|---|---|
| **SMB** (WhatsApp Business app / "on-premise-ish") | The number is managed as a small-business account. | `/register` returns **"Register endpoint is not available for SMB businesses"**, and the Cloud API can't send from it. |
| **Cloud API** | The number is registered to an app for programmatic send/receive. | This is the one you want. |

**A number on the SMB track cannot be driven by the Cloud API.** No amount of
token fixing, webhook re-subscribing, or asset assignment helps — it's the wrong
plumbing. You must (re-)register the number **through the developer dashboard**
so Meta mints it as a Cloud API number.

### How we actually fixed it (the worked example)

1. The number `+91 99076 40527` was first attached on the **SMB** track.
   - Inbound worked (webhook fired), but **every outbound reply 400'd**.
   - `POST /<phone_number_id>/register` → *"not available for SMB businesses"*.
2. Re-registered the number via **App Dashboard → WhatsApp → API Setup → Step 2
   ("Register number")**. This minted a **brand-new set of IDs** on the Cloud API
   track:

   | Thing | Old (SMB) | New (Cloud API) |
   |---|---|---|
   | Phone Number ID | `627975050397956` | **`1191418160729928`** |
   | WABA ID | `1358262832035194` (portfolio "Papyr") | **`1314835047123052`** |

3. The old Phone Number ID **stopped existing**. The tell-tale error:

   ```
   WhatsApp send failed (400): Object with ID '627975050397956' does not exist,
   cannot be loaded due to missing permissions ... code:100, error_subcode:33
   ```

   That is **not** a permissions bug — it's "you're sending from a dead ID."
   The fix is to point the app at the **new** Phone Number ID.

> ⚠️ Re-registering mints NEW ids. Any time you see `does not exist … subcode
> 33` on send, suspect a **stale `WHATSAPP_PHONE_NUMBER_ID`** before anything
> else.

---

## The clean setup path (do it in this order)

### 1. Number lives on a Cloud API app
App Dashboard (`developers.facebook.com`) → your app → **WhatsApp → API Setup**:
- The number must appear here with a **Phone Number ID** and status **Registered**.
- If it shows the SMB error on register, the number is on the SMB track — remove
  it from the WhatsApp Business app / Business portfolio's SMB side first, then
  register it here.

### 2. Permanent token that can *use* the number
Business Settings (`business.facebook.com/settings`) → **Users → System Users**:
- Select (or create) your System User.
- **Add Assets** → **WhatsApp accounts** → check the **WABA that owns the
  number** (the *new* one after any re-register) → **Full control** → Save.
- **Generate token** → scopes `whatsapp_business_messaging` +
  `whatsapp_business_management` → **Expiration: Never**.
- Verify it's permanent at `developers.facebook.com/tools/debug/accesstoken` —
  **Expires** must read **Never**.

### 3. Webhook subscribed
App Dashboard → **WhatsApp → Configuration**:
- **Callback URL** = `https://<your-app>.onrender.com/webhook`, **Verify token**
  = your `WHATSAPP_VERIFY_TOKEN`. Click **Verify and Save**.
- Subscribe the **`messages`** field (not just the top-level webhook).
- Confirm the **WABA is subscribed to the app**:
  `POST /<WABA_ID>/subscribed_apps` should return `{"success": true}`.

### 4. Render env vars, then redeploy
- `WHATSAPP_PHONE_NUMBER_ID` = the **current** Phone Number ID (e.g.
  `1191418160729928`).
- `WHATSAPP_TOKEN` = the permanent System User token.
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` as configured.
- Save → wait for **"Live"** before testing (see OPERATIONS.md on deploy churn).

### 5. Prove it end-to-end
Send `hi` to the number. You should get Papyr's welcome, and the logs should show
a webhook line and **no** `handleMessage failed`. If it fails, the error text
tells you which step is wrong (table below).

---

## Verify with Graph, don't guess

In **Graph API Explorer** (with your System User token selected), one GET ends
most of the guessing:

```
GET /<PHONE_NUMBER_ID>?fields=id,display_phone_number,verified_name,name_status,account_mode
```

- **Returns the number's details** → your token can see the number. Any remaining
  failure is the Render env var / redeploy, not permissions.
- **`#100` / permissions error** → the token can't see this number → fix asset
  assignment (step 2), then re-run.

List which WABAs your token owns (to find the right ID after a re-register):

```
GET /me/businesses                              # portfolios you administer
GET /<BUSINESS_ID>/owned_whatsapp_business_accounts
```

---

## Send-error cheat sheet

| Error on send | Meaning | Fix |
|---|---|---|
| `Object with ID '…' does not exist … subcode 33` | Sending from a **stale/old** Phone Number ID | Set `WHATSAPP_PHONE_NUMBER_ID` to the current ID, redeploy |
| `code:190` / token invalid or expired | Token died (temporary token, or re-login) | Permanent System User token (OPERATIONS.md §1) |
| `#100` permissions on a valid ID | Token lacks the WABA/number as an asset | Add Assets to the System User (step 2) |
| `Register endpoint is not available for SMB businesses` | Number is on the **SMB track** | Re-register via App Dashboard → API Setup (mints new IDs) |
| Inbound works, outbound silent, no error logged | Reply never attempted (rate limit / 24h window) | Check `RATE_LIMIT_PER_MIN`; business-initiated messages need an open 24h window |

---

## Current live values (Papyr)

Kept here so the working config is never a mystery. **Not secrets** — the token
is the only secret and it is not here.

- Display number: **+91 99076 40527**  (`wa.me/919907640527`)
- Phone Number ID: **`1191418160729928`**
- WABA ID: **`1314835047123052`**
- Track: **Cloud API** (registered via App Dashboard)

If any of these change again, update this list — it's the first thing to check
when sends start failing.
