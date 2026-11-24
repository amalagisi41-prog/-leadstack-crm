---
title: Import contacts
description: Bring your contacts into AgentStack without creating duplicates or losing useful notes.
category: Getting started
order: 1
---

Move buyer, seller, and sphere contacts from GoHighLevel into AgentStack CRM using a CSV, field mapping, and a duplicate preview.

The contact importer brings person records into the selected workspace. It does not move an entire GoHighLevel account, conversation archive, deal history, or automation configuration. Keep the original export as your migration backup. Start with a small sample of active buyers and sellers so you can confirm the result before moving your broader sphere.

## Before you start

Export your contacts from GoHighLevel as CSV. The exact export menu and available columns in your GHL account are **[VERIFY IN APP]**. Keep one row per person and one primary email per row. AgentStack’s CSV preparation requires a valid email; phone-only rows are invalid in this importer. Resolve those rows separately instead of expecting the preview to invent an email address.

## Numbered import steps

1. Save an untouched copy of the GoHighLevel export, then prepare a working copy. Remove test contacts and obvious junk. Keep the contacts you have permission to retain, and plan separately for any communications consent you need to document. Importing a person record is not proof that the person agreed to receive a new automated campaign.
2. Combine First Name and Last Name into one Name column before uploading. The mapping form has one Name destination, not separate first-name and last-name fields. If you map both source columns to Name, one value can overwrite the other. Check names for households and past clients rather than assuming every row represents an individual buyer.
3. Open People in the correct workspace and choose the contact import action. The setup checklist links to People with the import flow open. Choose your CSV file and wait for the column mapping. If the file appears empty or invalid, check that it is actually CSV with a header row rather than an Excel workbook renamed with a CSV extension.
4. Map the GoHighLevel columns to the available destinations. Full Name maps to Name, Email maps to Email, Phone maps to Phone, and Company Name maps to Company. Tags maps to Tags. The available destinations are Name, Email, Phone, Company, Source, and Tags; use Skip column for unsupported IDs, custom fields, address fields, conversation text, and unrelated export metadata.
5. Normalize Source before importing. Accepted source values are website, referral, ads, and other; an unfamiliar source value becomes other. For example, a detailed portal or campaign label from GHL will not remain a distinct source automatically. Preserve meaningful origin detail in a prepared Tags column when appropriate, and retain the original export for reference.
6. Review Tags and the initial row preparation. Tags split on commas or semicolons. Check a sample buyer with multiple tags and a past client with a referral tag so you can verify the intended grouping. Avoid mapping unrelated note text into Tags simply because it contains commas. Unsupported notes should remain in your backup until you choose a supported migration approach.
7. Run the preview and read the ready, duplicate, and invalid counts before committing. The flow distinguishes duplicates already in the workspace from duplicates within the file. Inspect the skipped-row messages and correct invalid emails in your working copy. Do not interpret a duplicate as a guarantee that every field on the existing contact will be updated; this flow reports created and skipped records.
8. Commit the import and wait for the result. Review created, skipped, and error totals, then open several contacts in People. Compare name, email, phone, company, source, and tags with your working copy. Test an active buyer, a seller, and a sphere contact before importing the remaining batches. Keep the result totals beside the original export so reconciliation is straightforward.

## Common mistakes

**GoHighLevel mapping:** separate name columns need combining, detailed GHL source labels need normalization, and GHL contact IDs are not AgentStack contact IDs. Deals, conversations, custom fields, and notes are not destinations in this CSV dialog. Do not promise a complete account migration based on a successful contact import. Fix mappings before the full upload instead of creating a larger cleanup task.

After importing, decide which contacts need a call, consultation, or follow-up task first. Keep automated messaging disabled until you have reviewed the appropriate consent and channel configuration. A clean, checked set of warm contacts is more useful than a large database whose source and next action are unclear.

Next: [organize your buyer and seller pipeline stages](/help/pipeline-stages).
