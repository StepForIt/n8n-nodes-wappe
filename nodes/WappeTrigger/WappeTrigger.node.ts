import { createHmac, timingSafeEqual } from 'crypto';
import {
	NodeApiError,
	NodeConnectionTypes,
	type IBinaryKeyData,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';
import { authenticationProperty, wappeApiRequest, wappeCredentials } from '../Wappe/transport';
import { getAccounts, searchLists } from '../Wappe/listSearch';
import { locator } from '../Wappe/locators';

type Subscription = { id: string; url: string; secret?: string };
type WappeEvent = {
	id?: string;
	event?: string;
	subscriptionId?: string;
	at?: string;
	data?: IDataObject & {
		media?: { kind?: string; mimetype?: string; filename?: string; downloadPath?: string } | null;
	};
};

const SUBSCRIPTIONS = '/api/webhooks/subscriptions';

const EVENT_OPTIONS = [
	{ name: 'Call Received', value: 'call.received', description: 'Incoming WhatsApp call' },
	{
		name: 'Contact Created',
		value: 'contact.created',
		description: 'First message from a new contact',
	},
	{
		name: 'Contact Lists Changed',
		value: 'contact.lists_changed',
		description: 'Lists added to or removed from a chat',
	},
	{
		name: 'Contact Stage Changed',
		value: 'contact.stage_changed',
		description: 'The contact moved to another pipeline stage',
	},
	{
		name: 'Message Deleted',
		value: 'message.deleted',
		description: 'A message was deleted for everyone',
	},
	{ name: 'Message Edited', value: 'message.edited', description: 'A message was edited' },
	{
		name: 'Message Reaction',
		value: 'message.reaction',
		description: 'A reaction was added or removed',
	},
	{
		name: 'Message Read Receipt',
		value: 'message.ack',
		description: 'One of your messages was sent, delivered, read or played',
	},
	{
		name: 'Message Received',
		value: 'message.received',
		description: 'A contact sent a message to one of your accounts',
	},
	{
		name: 'Message Sent',
		value: 'message.sent',
		description: 'A message was sent: from Wappe, an automation, the API or the phone',
	},
];

type Filters = {
	accounts?: string[];
	groups?: string;
	listMode?: string;
	lists?: { list?: Array<{ value?: { value?: string } | string }> };
	types?: string[];
	sources?: string[];
	text?: string;
	textOperation?: string;
	caseSensitive?: boolean;
};

/** Body of a version 2 subscription: events, server-side filters, transcription. */
export function subscriptionOptions(param: (name: string, fallback?: unknown) => unknown): IDataObject {
	const f = (param('filters', {}) ?? {}) as Filters;
	const lists = (f.lists?.list ?? [])
		.map((l) => String((typeof l.value === 'object' ? l.value?.value : l.value) ?? '').trim())
		.filter(Boolean);
	const filters: IDataObject = { groups: f.groups || 'exclude' };
	if (f.accounts?.length) filters.accounts = f.accounts;
	if (lists.length) filters.lists = { mode: f.listMode || 'any', values: lists };
	if (f.text) {
		filters.text = { op: f.textOperation || 'contains', value: f.text, caseSensitive: !!f.caseSensitive };
	}
	if (f.types?.length) filters.types = f.types;
	if (f.sources?.length) filters.sources = f.sources;
	return {
		events: param('events', ['message.received']) as string[],
		filters,
		transcribe: !!param('transcribe', false),
	};
}

/** True when `signature` is the HMAC-SHA256 of `rawBody` with `secret` (constant-time). */
export function isValidSignature(
	rawBody: string | Buffer,
	signature: string,
	secret: string,
): boolean {
	const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
	const a = Buffer.from(expected);
	const b = Buffer.from(String(signature || ''));
	return a.length === b.length && timingSafeEqual(a, b);
}

export class WappeTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Wappe Trigger',
		name: 'wappeTrigger',
		icon: { light: 'file:../../icons/wappe.svg', dark: 'file:../../icons/wappe.dark.svg' },
		group: ['trigger'],
		version: [1, 2],
		defaultVersion: 2,
		subtitle: '={{($parameter["events"] || [$parameter["event"]]).join(", ")}}',
		description: 'Starts the workflow on Wappe events: messages received or sent, read receipts, reactions, contacts, calls',
		defaults: { name: 'Wappe Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: wappeCredentials,
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			authenticationProperty,
			// ── Version 1 (0.1 to 0.3): one event, groups on/off. Kept for saved workflows. ──
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				default: 'message.received',
				displayOptions: { show: { '@version': [1] } },
				options: [
					{
						name: 'Message Received',
						value: 'message.received',
						description: 'A contact sent a message to one of your accounts',
					},
				],
			},
			{
				displayName: 'Include Group Messages',
				name: 'includeGroups',
				type: 'boolean',
				default: false,
				displayOptions: { show: { '@version': [1] } },
				description: 'Whether to also trigger on messages posted in WhatsApp groups',
			},
			// ── Version 2: several events, filters applied by Wappe before sending, transcription. ──
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['message.received'],
				displayOptions: { show: { '@version': [{ _cnd: { gte: 2 } }] } },
				options: EVENT_OPTIONS,
			},
			{
				displayName: 'Transcribe Voice Notes',
				name: 'transcribe',
				type: 'boolean',
				default: false,
				displayOptions: { show: { '@version': [{ _cnd: { gte: 2 } }] } },
				description:
					'Whether Wappe transcribes voice notes before triggering: the text arrives in "transcription" (counts transcription minutes once, even if several workflows ask)',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { '@version': [{ _cnd: { gte: 2 } }] } },
				description: 'Applied by Wappe before sending: a filtered-out event never runs the workflow',
				options: [
					{
						displayName: 'Account Names or IDs',
						name: 'accounts',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getAccounts' },
						default: [],
						description:
							'Only these accounts (all if empty). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Groups',
						name: 'groups',
						type: 'options',
						default: 'exclude',
						options: [
							{ name: 'Exclude Groups', value: 'exclude', description: 'Private chats only' },
							{ name: 'Include Groups', value: 'include', description: 'Private chats and groups' },
							{ name: 'Only Groups', value: 'only', description: 'WhatsApp groups only' },
						],
					},
					{
						displayName: 'List Match',
						name: 'listMode',
						type: 'options',
						default: 'any',
						description: 'How the lists below apply to the chat',
						options: [
							{ name: 'In All of the Lists', value: 'all' },
							{ name: 'In Any of the Lists', value: 'any' },
							{ name: 'In None of the Lists', value: 'none' },
						],
					},
					{
						displayName: 'Lists',
						name: 'lists',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						placeholder: 'Add List',
						default: {},
						description:
							'Lists of the chat. A name is resolved when the workflow is activated: renaming the list later changes nothing.',
						options: [
							{
								displayName: 'List',
								name: 'list',
								values: [
									locator({
										displayName: 'List',
										name: 'value',
										search: 'searchLists',
										idPlaceholder: 'cat_client',
										namePlaceholder: 'Client',
									}),
								],
							},
						],
					},
					{
						displayName: 'Message Types',
						name: 'types',
						type: 'multiOptions',
						default: [],
						description: 'Message Received / Message Sent only',
						options: [
							{ name: 'Document', value: 'document' },
							{ name: 'Image', value: 'image' },
							{ name: 'Other', value: 'other' },
							{ name: 'Sticker', value: 'sticker' },
							{ name: 'Text', value: 'text' },
							{ name: 'Video', value: 'video' },
							{ name: 'Voice Note', value: 'voice' },
						],
					},
					{
						displayName: 'Sent From',
						name: 'sources',
						type: 'multiOptions',
						default: [],
						description: 'Message Sent only: where the message was sent from',
						options: [
							{ name: 'API', value: 'api' },
							{ name: 'Automation', value: 'automation' },
							{ name: 'Phone', value: 'phone' },
							{ name: 'Wappe Interface', value: 'ui' },
						],
					},
					{
						displayName: 'Text',
						name: 'text',
						type: 'string',
						default: '',
						description: 'Message Received / Sent / Edited only. Empty: no text filter.',
					},
					{
						displayName: 'Text Case Sensitive',
						name: 'caseSensitive',
						type: 'boolean',
						default: false,
						description: 'Whether the text filter is case sensitive',
					},
					{
						displayName: 'Text Match',
						name: 'textOperation',
						type: 'options',
						default: 'contains',
						options: [
							{ name: 'Contains', value: 'contains' },
							{ name: 'Matches Regex', value: 'regex' },
							{ name: 'Starts With', value: 'startsWith' },
						],
					},
				],
			},
			{
				displayName: 'Download Media',
				name: 'downloadMedia',
				type: 'boolean',
				default: true,
				description:
					'Whether to download the attachment (photo, voice note, video, document) into the binary property "data"',
			},
		],
	};

	methods = {
		loadOptions: { getAccounts },
		listSearch: { searchLists },
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (!staticData.subscriptionId) return false;
				const res = (await wappeApiRequest.call(this, 'GET', SUBSCRIPTIONS)) as {
					subscriptions?: Subscription[];
				};
				const url = this.getNodeWebhookUrl('default');
				const found = (res.subscriptions ?? []).some(
					(s) => s.id === staticData.subscriptionId && s.url === url,
				);
				if (!found) {
					delete staticData.subscriptionId;
					delete staticData.secret;
				}
				return found;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const body = {
					url: this.getNodeWebhookUrl('default'),
					...(this.getNode().typeVersion >= 2
						? subscriptionOptions(this.getNodeParameter.bind(this))
						: {
								events: [this.getNodeParameter('event') as string],
								includeGroups: this.getNodeParameter('includeGroups') as boolean,
							}),
					description: `n8n workflow ${this.getWorkflow().id ?? ''}`.trim(),
				};
				const sub = (await wappeApiRequest.call(this, 'POST', SUBSCRIPTIONS, body)) as Subscription;
				if (!sub?.id || !sub.secret) {
					throw new NodeApiError(this.getNode(), sub as unknown as JsonObject, {
						message: 'Wappe did not return a subscription',
					});
				}
				staticData.subscriptionId = sub.id;
				staticData.secret = sub.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (!staticData.subscriptionId) return true;
				const res = (await wappeApiRequest.call(
					this,
					'DELETE',
					`${SUBSCRIPTIONS}/${encodeURIComponent(String(staticData.subscriptionId))}`,
					undefined,
					undefined,
					{ ignoreHttpStatusErrors: true, returnFullResponse: true },
				)) as { statusCode: number; body: JsonObject };
				// 404: already gone on the Wappe side, which is the state we want.
				if (res.statusCode >= 400 && res.statusCode !== 404) {
					throw new NodeApiError(this.getNode(), res.body ?? {}, {
						httpCode: String(res.statusCode),
						message: 'Could not delete the Wappe subscription',
					});
				}
				delete staticData.subscriptionId;
				delete staticData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const staticData = this.getWorkflowStaticData('node');
		const secret = String(staticData.secret ?? '');
		const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? JSON.stringify(req.body);
		const signature = String(req.headers['x-wappe-signature'] ?? '');
		if (!secret || !isValidSignature(raw, signature, secret)) {
			this.getResponseObject().status(401).json({ error: 'invalid signature' });
			return { noWebhookResponse: true };
		}

		const payload = req.body as WappeEvent;
		const data = payload.data ?? {};
		const json: IDataObject = {
			...data,
			event: payload.event,
			deliveryId: payload.id,
			receivedAt: payload.at,
		};

		const media = data.media;
		let binary: IBinaryKeyData | undefined;
		if (media?.downloadPath && (this.getNodeParameter('downloadMedia', true) as boolean)) {
			const file = (await wappeApiRequest.call(
				this,
				'GET',
				media.downloadPath,
				undefined,
				undefined,
				{
					json: false,
					encoding: 'arraybuffer',
				},
			)) as ArrayBuffer | Buffer;
			binary = {
				data: await this.helpers.prepareBinaryData(
					Buffer.from(file as ArrayBuffer),
					media.filename || undefined,
					media.mimetype || undefined,
				),
			};
		}

		return { workflowData: [[{ json, ...(binary ? { binary } : {}) }]] };
	}
}
