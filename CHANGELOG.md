# Changelog

## 0.6.0

- **Breaking, server side** (Wappe API since 2026-09-25): opening a new WhatsApp conversation
  (a contact you never exchanged a message with) now requires consent. Without it, sends fail with
  `400 consent_required`. Replies in existing conversations are unaffected.
- New **Options → Contact Has Consented** on Send Text, Send Template, Send Media and Send Voice
  Note. Off by default: turn it on only when the contact agreed to be contacted.
- Send errors now show Wappe's message and code (`consent_required`, `opted_out`, `daily_limit`,
  `rate_limit`) instead of n8n's generic text ("Forbidden - perhaps check your credentials?").

## 0.5.1

- Fix: installing the package failed on n8n instances backed by Postgres (`invalid input syntax for
  type integer: "1.1"`). The new Wappe Trigger version is now **2** (was 1.1): n8n stores node
  versions as integers. Version 1 workflows are unchanged.

## 0.5.0

- New **Wappe OAuth2 API** credential (authorization code + PKCE): give n8n limited permissions
  (scopes) instead of the full-access API key, revocable from Wappe's Developers page. Authorization
  and token URLs are derived from the instance URL.
- **Authentication** field on the Wappe and Wappe Trigger nodes: API Key (default, unchanged) or OAuth2.

## 0.4.0

- **Wappe Trigger 2** (published as 1.1 in 0.5.0): several events at once - Message Received, Message Sent (with its source:
  Wappe interface, automation, API, phone), Message Read Receipt, Message Reaction, Message Edited,
  Message Deleted, Contact Created, Contact Stage Changed, Contact Lists Changed, Call Received.
- **Filters applied by Wappe before sending** (no useless executions): accounts, lists (any / all /
  none, by list, ID or name - a name is resolved at activation), groups (exclude / include / only),
  text (contains / starts with / regex), message type, sent from.
- **Transcribe Voice Notes** option: the transcription arrives with the event, counted once.
- Workflows using the Trigger version 1 keep working unchanged.
- Message → Get Many: **Cursor** field (`nextCursor` of the previous page). Paging by timestamp
  (`Before` / `nextBefore`) could skip messages sent in the same second.

## 0.3.0

- New resources: **Contact** (Get, Get Many with search / list / stage filters and Return All,
  Update: name, language, pipeline stage, custom fields - only what you set), **List** (Get Many,
  Add Chat, Remove Chat), **Pipeline** (Get Many, with stages and custom fields).
- Account, chat, contact, template, group and list fields are now **resource locators**: pick from a
  searchable list, or set an ID, or a name (account label, template name, list name). Values saved by
  earlier versions keep working.

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
