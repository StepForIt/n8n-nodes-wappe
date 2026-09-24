import type { INodeProperties } from 'n8n-workflow';

const forMessage = { resource: ['message'] };
const sendBody = {
	session: '={{$parameter.session}}',
	target: '={{$parameter.target}}',
};

export const messageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forMessage },
		options: [
			{
				name: 'Send Text',
				value: 'sendText',
				action: 'Send a text message',
				description: 'Send a WhatsApp text message from one of your accounts',
				routing: { request: { method: 'POST', url: '/api/trigger', body: sendBody } },
			},
			{
				name: 'Send Template',
				value: 'sendTemplate',
				action: 'Send a template message',
				description:
					'Send a template from your Wappe library (with its attachment, if any), filling its variables',
				routing: { request: { method: 'POST', url: '/api/trigger', body: sendBody } },
			},
		],
		default: 'sendText',
	},
];

export const messageFields: INodeProperties[] = [
	{
		displayName: 'Recipient',
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
		displayOptions: { show: { ...forMessage, operation: ['sendText'] } },
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
		displayOptions: { show: { ...forMessage, operation: ['sendTemplate'] } },
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
		displayOptions: { show: { ...forMessage, operation: ['sendTemplate'] } },
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
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
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
];
