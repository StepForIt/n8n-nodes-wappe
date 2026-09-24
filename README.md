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
| Template | Get Many | `GET /api/templates` |
| Account | Get Many | `GET /api/me` |
| Usage | Get (transcription minutes and WAPPE AI tokens of the month) | `GET /api/v1/usage` |

Every send can quote a message (**Options → Reply To Message ID**). Read operations have a
**Simplify** switch (on by default) that keeps only the useful fields — smaller items, fewer tokens
for AI steps.

The account, template and group fields show dropdown lists read from your instance.
The chat can be an international phone number (`33612345678`), a WhatsApp ID (`…@c.us`),
a group (`…@g.us`) or an Instagram recipient (`ig:…`).
Group operations work on WhatsApp Web accounts. Accounts on the official Meta API don't have groups.

## Trigger

**Wappe Trigger** → event **Message Received**.

- When the workflow is activated, n8n subscribes its webhook URL on your instance
  (`POST /api/webhooks/subscriptions`). When it is deactivated, n8n removes the subscription.
- Every delivery is signed (`X-Wappe-Signature: sha256=…`, HMAC of the body with a per-subscription
  secret). The node rejects anything unsigned or badly signed.
- Output: `session`, `chatId`, `from`, `name`, `text`, `msgId`, `ts`, `isGroup`, `reply`, `media`.
  With **Download Media** on, the attachment (photo, voice note, video, document) is in the binary property `data`.
- Group messages are ignored unless **Include Group Messages** is on.
- WhatsApp sometimes delivers the same message twice. Wappe sends it to n8n only once.

If n8n runs on the same server or private network as Wappe, the instance needs
`WEBHOOK_SUBSCRIPTIONS_ALLOW_PRIVATE=1`. Otherwise Wappe refuses private addresses (SSRF protection).

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
