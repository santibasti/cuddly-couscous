# TopMop AI Email Integration — setup and deployment checklist

**Status: staging implementation; NOT deployed, not tested, send disabled by default.**

## Source
- UI: src/pages/EmailInbox.tsx, integrated at /email under Sales
- Database: supabase/migrations/0086_ai_email.sql
- Edge Function: supabase/functions/email-assistant/
- Messages are stored in isolated tables, not in OpsPilot's offline synchronization tables.

## Microsoft 365 prerequisite
1. Confirm that info@topmop.ph is an Exchange Online mailbox in your Microsoft 365 tenant.
2. In Microsoft Entra, create a confidential app registration. Obtain tenant ID, client ID, and a client secret.
3. Grant the Microsoft Graph application permissions required for mailbox read and reply; obtain admin consent.
4. **Scope app access to only info@topmop.ph using Exchange Online app RBAC or an appropriate application access restriction.** Never give this service unrestricted access to all company mailboxes.
5. Test Graph access from a non-production environment before enabling any send capability.

## Supabase prerequisites
1. Apply migrations 0086, 0087, and 0088 in staging first. Make sure earlier migrations are applied.
2. Deploy the email-assistant Edge Function with JWT verification enabled.
3. Configure these Supabase Edge Function secrets (never VITE_ or client-side):
   - MS_TENANT_ID
   - MS_CLIENT_ID
   - MS_CLIENT_SECRET
   - EMAIL_MAILBOX=info@topmop.ph
   - EMAIL_ALLOWED_ORIGIN=https://YOUR-OPS-PILOT-DOMAIN
   - OPENAI_API_KEY
   - OPENAI_EMAIL_MODEL (optional)
   - TOPMOP_EMAIL_POLICY (approved text; include current city-specific rates, safe access rules, commercial assessment rules and Sophia signoff)
   - EMAIL_SEND_ENABLED=false
   - EMAIL_SYNC_SECRET (long random secret for trusted scheduled sync calls)
4. Verify roles: owner/ops may access the AI Inbox; other roles must not see email content.
5. Confirm that Microsoft Graph APIs work and that the app is authorized only for the intended mailbox.

## Suggested initial test
- Send a non-sensitive inquiry from a test address.
- Use Sync Outlook; verify only one record is imported despite multiple syncs.
- Generate an AI draft and compare with current TopMop policies.
- Edit the draft and save. Verify nothing is sent.
- Validate email thread reply behavior and duplicate-send handling using a test mailbox.
- Only then change EMAIL_SEND_ENABLED=true in a controlled test environment.
- Verify Microsoft Sent Items, audit records and permissions.
- Review how bounced/failed/uncertain responses are reconciled. The code flags uncertain send status for manual review and must not automatically retry.

## Unattended email monitoring
The current interface synchronizes messages when an authorized user selects Sync Outlook.
For continuous operation with the PC off, configure a scheduled secure server-side sync job (or Microsoft Graph change notifications with subscriptions and renewal). Do not reuse an end-user browser session or expose the service-role key.
The server supports a secret-authenticated sync request, but **the recurring scheduler has not been configured or tested**. Set the request header x-email-sync-secret and body {"action":"sync"} from a trusted scheduler. Do not expose this secret to the browser.

## Release gate
- Confirm that the deployed UI and GitHub branch match (uncommitted dashboard features must be reconciled).
- Pass frontend typecheck and build, SQL migration validation, Edge Function tests and Microsoft 365 sandbox tests.
- Check sender/recipient, approved text, duplicate-click behavior, and permissions.
- Merge only after approval, then deploy and monitor.

Do not expose credentials or API keys in GitHub issues, chat, browser code or Vercel client variables.

## Deployment source discrepancy
The live Supabase project currently has schema migrations through 0085, while this GitHub repository starts from an older application snapshot. The email migration has been moved to 0086 to avoid collision. Do not automatically apply older repository migrations to the live database. Verify alignment before any release.

## Staging verification (2026-11-05)
- Project: ai-email-staging (fvsblabffwhofunmabwp); parent production: ghbumxivporzsalivgyg.
- Migrations applied in staging: ai_email, ai_email_permissions, ai_email_role_policy (files 0086–0088 in GitHub).
- email-assistant Edge Function deployed to staging with JWT verification enabled; no Graph credentials configured and EMAIL_SEND_ENABLED not enabled.
- Synthetic message database insert and rollback passed.
- Anonymous SQL table access denied; authenticated session without an approved profile returns zero rows.
- Frontend deployment status and Microsoft integration should still be tested end-to-end; nothing is merged to production.
