# Changelog

## 0.1.0

- `Wappe API` credential (instance URL + API key, tested on `GET /api/me`).
- `Wappe` node: send a text or a template message; create a group, add/remove members,
  promote/demote admins, rename/describe, get the invite link, list groups; list templates and accounts.
- `Wappe Trigger` node: *Message Received* event through a signed webhook subscription
  (subscribed on activation, removed on deactivation), with the attachment as binary data.
