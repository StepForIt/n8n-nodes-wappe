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
| Message | Send Text | `POST /api/trigger` |
| Message | Send Template (with variables and attachment) | `POST /api/trigger` |
| Group | Create (members, description, welcome message) | `POST /api/group/create` |
| Group | Add Members / Remove Members | `POST /api/group/participants` |
| Group | Promote Admins / Demote Admins | `POST /api/group/admins` |
| Group | Update (name, description) | `PATCH /api/group` |
| Group | Get Invite Link | `GET /api/group/invite` |
| Group | Get Many | `GET /api/groups` |
| Template | Get Many | `GET /api/templates` |
| Account | Get Many | `GET /api/me` |

The account, template and group fields show dropdown lists read from your instance.
The recipient can be an international phone number (`33612345678`), a WhatsApp ID (`…@c.us`),
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
