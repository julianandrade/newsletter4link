# Newsletter Archive via SharePoint

> Design Document | January 30, 2026

## Summary

Auto-publish weekly newsletters to a SharePoint Communication Site when sent, creating a searchable internal archive for employees.

## Goals

- **Discoverability**: Searchable archive of past newsletters
- **Continuity**: New employees can catch up on past editions
- **Showcase**: Demonstrate newsletter value internally
- **Reference**: Linkable content for internal communications

## Architecture

```
Email Send → Render HTML → Upload Images → Create SharePoint Page → Publish
                                                      ↓
                                              Store URL in Edition
```

### Flow

1. User clicks "Send Newsletter" in dashboard
2. Emails sent to subscribers (existing flow)
3. **New**: After emails sent, trigger SharePoint publish
4. Convert newsletter HTML to SharePoint page format
5. Upload images to SharePoint assets library
6. Create and publish page via Microsoft Graph API
7. Store SharePoint URL in Edition record
8. Show success/failure in dashboard

## Database Changes

Add to `Edition` model in `prisma/schema.prisma`:

```prisma
model Edition {
  // ... existing fields ...

  // SharePoint publishing
  sharePointUrl         String?   // URL to published page
  sharePointPageId      String?   // Graph API page ID
  sharePointPublishedAt DateTime? // When published
  sharePointError       String?   // Last error message
}
```

## New Files

```
lib/sharepoint/
├── auth.ts           # MSAL certificate authentication
├── client.ts         # Microsoft Graph API wrapper
├── pageBuilder.ts    # Newsletter HTML → SharePoint web parts
└── publisher.ts      # Main publishing orchestration

app/api/sharepoint/
└── publish/route.ts  # Manual publish/retry endpoint
```

## Integration Points

### Modify: `/api/email/send-all/route.ts`

After successful email send:
```typescript
// After emails sent successfully
await publishToSharePoint(editionId);
```

### Modify: Edition dashboard UI

- Show SharePoint status (published/pending/failed)
- Show "View on SharePoint" link when published
- Show "Retry" button when failed

## Environment Variables

```bash
# SharePoint Integration
SHAREPOINT_TENANT_ID=
SHAREPOINT_CLIENT_ID=
SHAREPOINT_SITE_URL=https://link.sharepoint.com/sites/newsletter-archive
SHAREPOINT_CERTIFICATE_THUMBPRINT=
SHAREPOINT_CERTIFICATE_PRIVATE_KEY=
```

## Azure AD Setup (One-time)

1. **Create App Registration**
   - Azure Portal → Azure AD → App registrations → New
   - Name: "Newsletter4Link SharePoint Publisher"

2. **Generate Certificate**
   ```bash
   openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
   ```
   - Upload cert.pem to App Registration → Certificates
   - Save thumbprint and key.pem content

3. **Grant Permissions**
   - API permissions → Add → Microsoft Graph
   - `Sites.ReadWrite.All` (Application permission)
   - Grant admin consent

4. **Create SharePoint Site**
   - SharePoint Admin → Create site → Communication site
   - Name: "Newsletter Archive" or similar
   - Note the site URL

## SharePoint Site Structure

```
Newsletter Archive (Communication Site)
├── Site Pages/
│   └── 2026/
│       ├── week-01-2026.aspx
│       ├── week-02-2026.aspx
│       └── ...
└── Newsletter Assets/ (Document Library)
    └── 2026/
        └── images/
```

## Implementation Tasks

### Phase 1: Infrastructure
- [ ] T001: Add SharePoint fields to Edition model + migration
- [ ] T002: Create `lib/sharepoint/auth.ts` - MSAL certificate auth
- [ ] T003: Create `lib/sharepoint/client.ts` - Graph API wrapper

### Phase 2: Publishing
- [ ] T004: Create `lib/sharepoint/pageBuilder.ts` - HTML to web parts
- [ ] T005: Create `lib/sharepoint/publisher.ts` - orchestration
- [ ] T006: Create `/api/sharepoint/publish/route.ts` - manual trigger

### Phase 3: Integration
- [ ] T007: Integrate publish into email send flow
- [ ] T008: Update Edition dashboard UI with SharePoint status

### Phase 4: Testing & Docs
- [ ] T009: Test end-to-end flow
- [ ] T010: Document Azure AD setup steps

## Verification

1. **Unit tests**: Auth token acquisition, page builder conversion
2. **Integration test**: Create test page in SharePoint, verify it appears
3. **E2E test**: Send test newsletter, verify SharePoint page created
4. **Manual check**: Verify page formatting looks correct in SharePoint

## Dependencies

- `@azure/msal-node` - Microsoft authentication library
- Azure AD App Registration (admin setup)
- SharePoint Communication Site (admin setup)

## Error Handling

- If SharePoint publish fails, email send still succeeds
- Error stored in `Edition.sharePointError`
- Dashboard shows retry option
- Logs capture full error for debugging

## Timeline Consideration

Microsoft is retiring the legacy SharePoint add-in model on **April 2, 2026**. This design uses the recommended certificate-based MSAL authentication which will continue to work.

## Not In Scope

- Archive browser in the dashboard (users use SharePoint directly)
- Retroactive publishing of past editions
- Multi-site publishing
- Custom SharePoint page templates
