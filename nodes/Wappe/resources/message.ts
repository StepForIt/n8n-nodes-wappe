import type { INodeProperties } from 'n8n-workflow';
import { attachMedia, toBinaryItem } from '../binary';

const forMessage = { resource: ['message'] };
const onMessage = (...operation: string[]) => ({ show: { ...forMessage, operation } });

const SESSION = '={{$parameter.session}}';
const TO = '={{$parameter.target}}';
const MSG = '={{$parameter.msgId}}';
const SIMPLE = '={{$parameter.simplify}}';
const sendBody = { session: SESSION, to: TO };
const onChat = { session: SESSION, chatId: TO, msgId: MSG };

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
							simple: SIMPLE,
						},
					},
					output: { postReceive: [{ type: 'rootProperty', properties: { property: 'messages' } }] },
				},
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
				routing: {
					send: { preSend: [attachMedia] },
					request: { method: 'POST', url: '/api/v1/messages', body: sendBody },
				},
			},
			{
				name: 'Send Template',
				value: 'sendTemplate',
				action: 'Send a template message',
				description:
					'Send a template from your Wappe library (with its attachment, if any), filling its variables',
				routing: { request: { method: 'POST', url: '/api/v1/messages', body: sendBody } },
			},
			{
				name: 'Send Text',
				value: 'sendText',
				action: 'Send a text message',
				description: 'Send a WhatsApp text message from one of your accounts',
				routing: { request: { method: 'POST', url: '/api/v1/messages', body: sendBody } },
			},
			{
				name: 'Send Voice Note',
				value: 'sendVoice',
				action: 'Send a voice note',
				description: 'Send an audio file as a WhatsApp voice note (converted automatically)',
				routing: {
					send: { preSend: [attachMedia] },
					request: { method: 'POST', url: '/api/v1/messages/voice', body: sendBody },
				},
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

export const messageFields: INodeProperties[] = [
	{
		displayName: 'Chat',
		name: 'target',
		type: 'string',
		required: true,
		default: '',
		placeholder: '33612345678',
		displayOptions: { show: forMessage },
		description:
			'International phone number, WhatsApp ID (…@c.us), group ID (…@g.us) or Instagram recipient (ig:…)',
	},
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
		displayName: 'Template Name or ID',
		name: 'templateId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTemplates' },
		required: true,
		default: '',
		displayOptions: onMessage('sendTemplate'),
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		routing: { send: { type: 'body', property: 'templateId' } },
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
			'Only messages at or before this timestamp (ms). Use nextBefore from a previous call to page back; 0 = latest.',
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
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: onMessage('sendText', 'sendTemplate', 'sendMedia'),
		options: [
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
];
