# Changelog

## 0.2.0

- All message operations now use the stable Wappe API v1 (`/api/v1/*`).
- Message: **Send Media** (URL or binary), **Send Voice Note**, **React**, **Edit**, **Delete**,
  **Get Many** (history, paginated), **Download Media** (binary), **Transcribe Voice Note**
  (counts transcription minutes, returns usage). Reply to a message (quote) on every send.
- New resources: **Chat → Mark as Read** (WhatsApp read receipt), **Usage → Get** (transcription
  minutes and WAPPE tokens of the month).
- **Simplify** option on read operations: smaller responses, fewer tokens for AI steps.

## 0.1.1

- First release on npm (0.1.0 was tagged but never published: `publishConfig.access` was missing).

## 0.1.0

- `Wappe API` credential (instance URL + API key, tested on `GET /api/me`).
- `Wappe` node: send a text or a template message; create a group, add/remove members,
  promote/demote admins, rename/describe, get the invite link, list groups; list templates and accounts.
- `Wappe Trigger` node: *Message Received* event through a signed webhook subscription
  (subscribed on activation, removed on deactivation), with the attachment as binary data.
