import type { INodeProperties } from 'n8n-workflow';

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many accounts',
				description: 'List the WhatsApp and Instagram accounts connected to the instance',
				routing: {
					request: { method: 'GET', url: '/api/me' },
					output: {
						postReceive: [{ type: 'rootProperty', properties: { property: 'accounts' } }],
					},
				},
			},
		],
		default: 'getAll',
	},
];

export const templateOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['template'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many templates',
				description: 'List the message templates of the Wappe library',
				routing: {
					request: { method: 'GET', url: '/api/templates' },
					output: {
						postReceive: [{ type: 'rootProperty', properties: { property: 'templates' } }],
					},
				},
			},
		],
		default: 'getAll',
	},
];

export const chatOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['chat'] } },
		options: [
			{
				name: 'Mark as Read',
				value: 'markRead',
				action: 'Mark a chat as read',
				description: 'Send the WhatsApp read receipt (blue ticks) for the latest received messages',
				routing: {
					request: {
						method: 'POST',
						url: '/api/v1/chats/read',
						body: { session: '={{$parameter.session}}', to: '={{$parameter.chatTarget}}' },
					},
				},
			},
		],
		default: 'markRead',
	},
	{
		displayName: 'Chat',
		name: 'chatTarget',
		type: 'string',
		required: true,
		default: '',
		placeholder: '33612345678',
		displayOptions: { show: { resource: ['chat'] } },
		description: 'International phone number or chat ID (…@c.us, …@g.us)',
	},
];

export const usageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['usage'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get this month usage',
				description: 'Transcription minutes and WAPPE AI tokens used this month',
				routing: {
					request: {
						method: 'GET',
						url: '/api/v1/usage',
						qs: { simple: '={{$parameter.usageSimplify}}' },
					},
				},
			},
		],
		default: 'get',
	},
	{
		displayName: 'Simplify',
		name: 'usageSimplify',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['usage'] } },
		description: 'Whether to return a simplified version of the response instead of the raw data',
	},
];
