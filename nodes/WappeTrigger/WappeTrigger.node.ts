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
import { wappeApiRequest } from '../Wappe/transport';

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
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when Wappe receives a WhatsApp message',
		defaults: { name: 'Wappe Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'wappeApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				default: 'message.received',
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
				description: 'Whether to also trigger on messages posted in WhatsApp groups',
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
					events: [this.getNodeParameter('event') as string],
					includeGroups: this.getNodeParameter('includeGroups') as boolean,
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
