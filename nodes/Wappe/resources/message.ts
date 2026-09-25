import type { INodeProperties } from 'n8n-workflow';
import { attachMedia, toBinaryItem } from '../binary';
import { sendResult } from '../errors';
import { locator, rl } from '../locators';
import { withIdempotencyKey } from '../queue';

const forMessage = { resource: ['message'] };
const onMessage = (...operation: string[]) => ({ show: { ...forMessage, operation } });

const SESSION = rl('session');
const TO = rl('target');
const MSG = '={{$parameter.msgId}}';
const SIMPLE = '={{$parameter.simplify}}';
const sendBody = { session: SESSION, to: TO };
const onChat = { session: SESSION, chatId: TO, msgId: MSG };
const sendRouting = (url: string) => ({
	request: {
		method: 'POST' as const,
		url,
		body: sendBody,
		ignoreHttpStatusErrors: true,
		returnFullResponse: true,
	},
	output: { postReceive: [sendResult] },
});

export const messageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forMessage },
		options: [
			{
				name: 'Delete',
				value: 'deleteMessage',
				action: 'Delete a message',
				description: 'Delete a message for you, or for everyone (your own messages, within 2 days)',
				routing: {
					request: {
						method: 'DELETE',
						url: '/api/v1/messages',
						qs: { ...onChat, everyone: '={{$parameter.everyone}}' },
					},
				},
			},
			{
				name: 'Download Media',
				value: 'downloadMedia',
				action: 'Download the attachment of a message',
				description: 'Get the photo, voice note, video or document of a message as binary data',
				routing: {
					request: {
						method: 'GET',
						url: '/api/v1/messages/media',
						qs: onChat,
						encoding: 'arraybuffer',
						json: false,
						returnFullResponse: true,
					},
					output: { postReceive: [toBinaryItem] },
				},
			},
			{
				name: 'Edit',
				value: 'editMessage',
				action: 'Edit a message',
				description: 'Change the text of one of your messages (within 15 minutes)',
				routing: {
					request: {
						method: 'PATCH',
						url: '/api/v1/messages',
						body: { ...onChat, text: '={{$parameter.newText}}' },
					},
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many messages',
				description: 'Read the latest messages of a conversation',
				routing: {
					request: {
						method: 'GET',
						url: '/api/v1/messages',
						qs: {
							session: SESSION,
							chatId: TO,
							limit: '={{$parameter.limit}}',
							before: '={{$parameter.before}}',
							cursor: '={{$parameter.cursor}}',
							simple: SIMPLE,
						},
					},
					output: { postReceive: [{ type: 'rootProperty', properties: { property: 'messages' } }] },
				},
			},
			{
				name: 'Get Send Status',
				value: 'getJob',
				action: 'Get the status of a queued send',
				description: 'Follow a message sent with Queue Sending: queued, sent (with its message IDs) or failed',
				routing: { request: { method: 'GET', url: '=/api/v1/jobs/{{$parameter.jobId}}' } },
			},
			{
				name: 'React',
				value: 'react',
				action: 'React to a message',
				routing: {
					request: {
						method: 'POST',
						url: '/api/v1/messages/react',
						body: { ...onChat, emoji: '={{$parameter.emoji}}' },
					},
				},
			},
			{
				name: 'Send Media',
				value: 'sendMedia',
				action: 'Send a media message',
				description: 'Send a photo, video, audio or document from a URL or from binary data',
				routing: { send: { preSend: [attachMedia, withIdempotencyKey] }, ...sendRouting('/api/v1/messages') },
			},
			{
				name: 'Send Template',
				value: 'sendTemplate',
				action: 'Send a template message',
				description:
					'Send a template from your Wappe library (with its attachment, if any), filling its variables',
				routing: { send: { preSend: [withIdempotencyKey] }, ...sendRouting('/api/v1/messages') },
			},
			{
				name: 'Send Text',
				value: 'sendText',
				action: 'Send a text message',
				description: 'Send a WhatsApp text message from one of your accounts',
				routing: { send: { preSend: [withIdempotencyKey] }, ...sendRouting('/api/v1/messages') },
			},
			{
				name: 'Send Voice Note',
				value: 'sendVoice',
				action: 'Send a voice note',
				description: 'Send an audio file as a WhatsApp voice note (converted automatically)',
				routing: { send: { preSend: [attachMedia] }, ...sendRouting('/api/v1/messages/voice') },
			},
			{
				name: 'Transcribe Voice Note',
				value: 'transcribe',
				action: 'Transcribe a voice note',
				description:
					'Turn a voice note into text. Counts against the monthly transcription minutes of the account (once per message).',
				routing: {
					request: {
						method: 'POST',
						url: '/api/v1/messages/transcribe',
						body: { ...onChat, simple: SIMPLE },
					},
				},
			},
		],
		default: 'sendText',
	},
];

/** An attestation by the user: never true by default, or cold outreach would be back. */
const CONSENT: INodeProperties = {
	displayName: 'Contact Has Consented',
	name: 'consent',
	type: 'boolean',
	default: false,
	description:
		'Whether the contact agreed to be contacted. Required to open a new conversation (a contact you never exchanged a message with); not needed to reply in an existing one.',
	routing: { send: { type: 'body', property: 'consent' } },
};

export const messageFields: INodeProperties[] = [
	locator({
		displayName: 'Chat',
		name: 'target',
		search: 'searchContacts',
		idPlaceholder: '33612345678 or 1203630…@g.us',
		displayOptions: { show: forMessage },
		description:
			'Contact or group. By ID: international phone number, WhatsApp ID (…@c.us), group ID (…@g.us) or Instagram recipient (ig:…).',
	}),
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		displayOptions: onMessage('sendText'),
		description: 'Message text. WhatsApp formatting (*bold*, _italic_, ~strike~) is supported.',
		routing: { send: { type: 'body', property: 'text' } },
	},
	{
		...locator({
			displayName: 'Template',
			name: 'templateId',
			search: 'searchTemplates',
			idPlaceholder: 'tpl_…',
			namePlaceholder: 'Welcome',
			displayOptions: onMessage('sendTemplate'),
		}),
		routing: {
			send: { type: 'body', property: 'templateId', value: '={{ $value?.value ?? $value }}' },
		},
	},
	{
		displayName: 'Variables',
		name: 'variables',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Variable',
		default: {},
		displayOptions: onMessage('sendTemplate'),
		description: 'Values for the {{key}} placeholders of the template',
		options: [
			{
				displayName: 'Variable',
				name: 'variable',
				values: [
					{
						displayName: 'Key',
						name: 'key',
						type: 'string',
						default: '',
						placeholder: 'firstName',
					},
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
		routing: {
			send: {
				type: 'body',
				property: 'vars',
				value:
					'={{ Object.fromEntries(($value.variable || []).filter((v) => v.key).map((v) => [v.key, v.value])) }}',
			},
		},
	},
	{
		displayName: 'Media Source',
		name: 'mediaSource',
		type: 'options',
		options: [
			{ name: 'Binary Data', value: 'binary', description: 'A file from a previous node' },
			{ name: 'URL', value: 'url', description: 'Wappe downloads the file itself' },
		],
		default: 'url',
		displayOptions: onMessage('sendMedia', 'sendVoice'),
	},
	{
		displayName: 'Media URL',
		name: 'mediaUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/invoice.pdf',
		displayOptions: {
			show: { ...forMessage, operation: ['sendMedia', 'sendVoice'], mediaSource: ['url'] },
		},
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: {
			show: { ...forMessage, operation: ['sendMedia', 'sendVoice'], mediaSource: ['binary'] },
		},
		description: 'Name of the binary property holding the file',
	},
	{
		displayName: 'Caption',
		name: 'caption',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		displayOptions: onMessage('sendMedia'),
		routing: { send: { type: 'body', property: 'text' } },
	},
	{
		displayName: 'Message ID',
		name: 'msgId',
		type: 'string',
		required: true,
		default: '',
		placeholder: '={{ $json.msgId }}',
		displayOptions: onMessage(
			'react',
			'editMessage',
			'deleteMessage',
			'downloadMedia',
			'transcribe',
		),
		description: 'The msgId of the message, as returned by the trigger or by Get Many',
	},
	{
		displayName: 'Emoji',
		name: 'emoji',
		type: 'string',
		default: '👍',
		displayOptions: onMessage('react'),
		description: 'Leave empty to remove your reaction',
	},
	{
		displayName: 'New Text',
		name: 'newText',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		displayOptions: onMessage('editMessage'),
	},
	{
		displayName: 'For Everyone',
		name: 'everyone',
		type: 'boolean',
		default: true,
		displayOptions: onMessage('deleteMessage'),
		description: 'Whether to delete the message for the recipient too, not only in Wappe',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 200 },
		default: 50,
		displayOptions: onMessage('getAll'),
		description: 'Max number of results to return',
	},
	{
		displayName: 'Before',
		name: 'before',
		type: 'number',
		default: 0,
		displayOptions: onMessage('getAll'),
		description:
			'Only messages at or before this timestamp (ms); 0 = latest. Prefer Cursor: a timestamp alone can skip messages sent in the same second.',
	},
	{
		displayName: 'Cursor',
		name: 'cursor',
		type: 'string',
		default: '',
		displayOptions: onMessage('getAll'),
		description: 'The nextCursor of a previous call, to read the page before it. Empty = latest.',
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: onMessage('getAll', 'transcribe'),
		description: 'Whether to return a simplified version of the response instead of the raw data',
	},
	{
		displayName: 'Job ID',
		name: 'jobId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'q_…',
		displayOptions: onMessage('getJob'),
		description: 'The jobId returned by a send with Queue Sending on',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: onMessage('sendText', 'sendTemplate', 'sendMedia'),
		options: [
			CONSENT,
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				description:
					'With Queue Sending: the same key (per credential, 24 h) returns the same job and sends nothing. Empty: one key per execution, node and item.',
				routing: { send: { type: 'body', property: 'idempotencyKey' } },
			},
			{
				displayName: 'Queue Sending',
				name: 'queue',
				type: 'boolean',
				default: false,
				description:
					'Whether to hand the message to Wappe and return at once (a jobId), instead of waiting for it to leave. Wappe sends it at the pace of the WhatsApp account. Use it for bulk sends.',
				routing: { send: { type: 'body', property: 'async' } },
			},
			{
				displayName: 'Reply To Message ID',
				name: 'replyTo',
				type: 'string',
				default: '',
				description: 'MsgId of a message of this chat to quote',
				routing: { send: { type: 'body', property: 'replyTo' } },
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: onMessage('sendVoice'),
		options: [CONSENT],
	},
];
