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
