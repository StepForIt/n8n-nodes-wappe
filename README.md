# n8n-nodes-wappe

n8n community nodes for [Wappe](https://wappe.me), the WhatsApp CRM and automation platform.
Send WhatsApp messages, manage groups, and start workflows when a contact writes to you.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Trigger](#trigger) · [Compatibility](#compatibility) · [Resources](#resources)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
and install the package `n8n-nodes-wappe`.

## Credentials

Each Wappe customer has their own instance, so the credential asks for two values:

| Field | Where to find it |
| --- | --- |
| **Instance URL** | The address of your Wappe instance, e.g. `https://wappe.example.com` |
| **API Key** | Wappe → **Developers** page (turn on the *Developers* module first). Regenerating it there invalidates the old one. |

n8n checks the credential with `GET /api/me`. The key is sent in the `X-Api-Key` header.
The API key gives **full access** to the instance.

### OAuth2

To give n8n **limited permissions** instead, choose **Authentication → OAuth2** in the node and create a
**Wappe OAuth2 API** credential:

1. In Wappe → **Developers** → **OAuth applications**, create an application. The n8n Cloud redirect URL
   (`https://oauth.n8n.cloud/oauth2/callback`) is pre-filled; for self-hosted n8n, add the
   *OAuth Redirect URL* shown in the n8n credential.
2. Copy the **Client ID** and **Client Secret** (shown once) into the credential, with your **Instance URL**.
3. Pick the **Permissions** (all by default): send messages, read conversations, read / update contacts,
   lists, WhatsApp groups, webhooks (Trigger), usage.
4. **Connect my account**: a Wappe administrator approves the permissions on the consent screen.

An operation outside the granted permissions fails with `403 insufficient_scope`. Access can be revoked
anytime in Wappe → Developers → **Connected applications** (the Trigger's subscriptions go with it).
The Trigger needs *Webhooks*, plus *Read conversations* for message and call events and *Read contacts*
for contact events.

## Operations

| Resource | Operation | Wappe endpoint |
| --- | --- | --- |
| Message | Send Text · Send Template (with variables) | `POST /api/v1/messages` |
| Message | Send Media (URL or binary: photo, video, audio, document) | `POST /api/v1/messages` |
| Message | Send Voice Note (any audio, converted to a WhatsApp voice note) | `POST /api/v1/messages/voice` |
| Message | React · Edit · Delete | `POST /api/v1/messages/react` · `PATCH` / `DELETE /api/v1/messages` |
| Message | Get Many (conversation history, paginated) | `GET /api/v1/messages` |
| Message | Download Media (binary, with file name and type) | `GET /api/v1/messages/media` |
| Message | Transcribe Voice Note (counts transcription minutes, returns usage) | `POST /api/v1/messages/transcribe` |
| Chat | Mark as Read (WhatsApp read receipt) | `POST /api/v1/chats/read` |
| Group | Create · Add / Remove Members · Promote / Demote Admins · Update · Get Invite Link · Get Many | `/api/group/*`, `GET /api/groups` |
| Contact | Get · Get Many (search, list, stage filters) · Update (name, language, stage, custom fields) | `GET` / `PATCH /api/v1/contact`, `GET /api/v1/contacts` |
| List | Get Many · Add Chat · Remove Chat | `GET /api/v1/lists`, `POST /api/v1/lists/members` |
| Pipeline | Get Many (stages and custom fields) | `GET /api/v1/pipelines` |
| Template | Get Many | `GET /api/templates` |
| Account | Get Many | `GET /api/me` |
| Usage | Get (transcription minutes and WAPPE AI tokens of the month) | `GET /api/v1/usage` |

Every send can quote a message (**Options → Reply To Message ID**). Read operations have a
**Simplify** switch (on by default) that keeps only the useful fields — smaller items, fewer tokens
for AI steps.

Account, chat, contact, template, group and list fields are **resource locators**: pick from a
searchable list read from your instance, or set an ID, or a name (account label, template name,
list name) - handy in expressions.
The chat can be an international phone number (`33612345678`), a WhatsApp ID (`…@c.us`),
a group (`…@g.us`) or an Instagram recipient (`ig:…`).
Group operations work on WhatsApp Web accounts. Accounts on the official Meta API don't have groups.

## Trigger

**Wappe Trigger** starts the workflow on one or more events:

| Event | When |
| --- | --- |
| Message Received | A contact sent a message |
| Message Sent | A message was sent: from Wappe, an automation, the API or the phone (`source`) |
| Message Read Receipt | One of your messages went up a level: sent, delivered, read, played (`status`) |
| Message Reaction | A reaction was added or removed |
| Message Edited / Message Deleted | A message was edited (`previousText`) or deleted for everyone |
| Contact Created | First message from a new contact |
| Contact Stage Changed | The contact moved to another pipeline stage (`before`, `after`) |
| Contact Lists Changed | Lists added to or removed from a chat (`added`, `removed`) |
| Call Received | Incoming WhatsApp call |

**Filters** are applied by Wappe *before* sending, so a filtered-out event never runs the workflow:
accounts, lists (any / all / none, picked from the list, by ID or by name), groups (exclude / include /
only), text (contains / starts with / regex), message type, and where a message was sent from.
A list set by name is resolved when the workflow is activated: renaming it later changes nothing, and
activation fails with a clear message if it does not exist.

**Transcribe Voice Notes**: Wappe transcribes the voice note before triggering, the text is in
`transcription` (`text`, `lang`, `seconds`, `remainingSeconds`). The minutes are counted once, even if
several workflows ask. If transcription fails, the event is still sent with
`transcription.error` (`quota`, `disabled` or `failed`).

- When the workflow is activated, n8n subscribes its webhook URL on your instance
  (`POST /api/webhooks/subscriptions`). When it is deactivated, n8n removes the subscription.
- Every delivery is signed (`X-Wappe-Signature: sha256=…`, HMAC of the body with a per-subscription
  secret). The node rejects anything unsigned or badly signed.
- Every event has `session`, `chatId`, `isGroup`, `from`, `name`; message events add `msgId`, `text`,
  `type`, `fromMe`, `ts`, `reply`, `media`. With **Download Media** on, the attachment (photo, voice
  note, video, document) is in the binary property `data`.
- WhatsApp sometimes delivers the same event twice. Wappe sends it to n8n only once.
- Workflows created before 0.4.0 (node version 1: Message Received, Include Group Messages) keep working.

Wappe only calls public addresses: n8n must be reachable from the internet (SSRF protection).

## Compatibility

Tested with n8n 2.x. No runtime dependencies.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- Wappe API reference: the **Developers** page of your instance, or its OpenAPI spec at
  `<instance>/api/openapi.client.json`

## License

[MIT](LICENSE.md)

## Maintainers

This repository is a read-only mirror of `packages/n8n-nodes-wappe` in the Wappe monorepo.
To release: bump `version` in `package.json` (and `CHANGELOG.md`) on `dev`, then tag that commit
`n8n-nodes-wappe@X.Y.Z` in the monorepo. The mirror job pushes tag `X.Y.Z` here, and `publish.yml`
publishes to npm with provenance.
