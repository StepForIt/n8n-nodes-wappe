import type { INodeProperties } from 'n8n-workflow';
import { splitContacts } from '../binary';
import { locator, rl } from '../locators';

const SESSION = rl('session');
const CONTACT = rl('contact');
const onContact = (...operation: string[]) => ({ show: { resource: ['contact'], operation } });
const onList = (...operation: string[]) => ({ show: { resource: ['list'], operation } });

export const contactOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['contact'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get a contact',
				description: 'Get the details of a contact: name, lists, stage, custom fields',
				routing: {
					request: {
						method: 'GET',
						url: '/api/v1/contact',
						qs: { session: SESSION, chatId: CONTACT, simple: '={{$parameter.contactSimplify}}' },
					},
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many contacts',
				description: 'Search contacts by name or number, list or pipeline stage',
				routing: {
					send: { paginate: '={{ $parameter.returnAll }}' },
					request: {
						method: 'GET',
						url: '/api/v1/contacts',
						qs: {
							search: '={{$parameter.search}}',
							limit: '={{ $parameter.returnAll ? 200 : $parameter.limit }}',
							simple: '={{$parameter.contactSimplify}}',
						},
					},
					operations: {
						pagination: {
							type: 'offset',
							properties: {
								limitParameter: 'limit',
								offsetParameter: 'cursor',
								pageSize: 200,
								rootProperty: 'contacts',
								type: 'query',
							},
						},
					},
					output: { postReceive: [splitContacts] },
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a contact',
				description:
					'Change the name, language, pipeline stage or custom fields - only what you set',
				routing: {
					request: {
						method: 'PATCH',
						url: '/api/v1/contact',
						body: { session: SESSION, chatId: CONTACT, simple: '={{$parameter.contactSimplify}}' },
					},
				},
			},
		],
		default: 'get',
	},
	locator({
		displayName: 'Contact',
		name: 'contact',
		search: 'searchContacts',
		idPlaceholder: '33612345678',
		displayOptions: onContact('get', 'update'),
		description: 'By ID: international phone number or WhatsApp ID (…@c.us)',
	}),
	{
		displayName: 'Search',
		name: 'search',
		type: 'string',
		default: '',
		placeholder: 'Camille or 0612',
		displayOptions: onContact('getAll'),
		description: 'Part of the name or of the phone number',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: onContact('getAll'),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 200 },
		default: 50,
		displayOptions: { show: { resource: ['contact'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: onContact('getAll'),
		options: [
			{
				displayName: 'Account',
				name: 'session',
				type: 'string',
				default: '',
				description: 'Only contacts of this account (ID or name)',
				routing: { send: { type: 'query', property: 'session' } },
			},
			{
				displayName: 'List Name or ID',
				name: 'list',
				type: 'string',
				default: '',
				description: 'Only contacts in this list',
				routing: { send: { type: 'query', property: 'list' } },
			},
			{
				displayName: 'Stage Name or ID',
				name: 'stage',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getStages' },
				default: '',
				description:
					'Only contacts at this pipeline stage. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				routing: { send: { type: 'query', property: 'stage' } },
			},
		],
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: onContact('update'),
		options: [
			{
				displayName: 'Language',
				name: 'lang',
				type: 'string',
				default: '',
				placeholder: 'fr',
				description: 'Language code used by the automations to answer; empty = automatic detection',
				routing: { send: { type: 'body', property: 'lang' } },
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Name shown in Wappe (the WhatsApp name is kept)',
				routing: { send: { type: 'body', property: 'name' } },
			},
			{
				displayName: 'Stage Name or ID',
				name: 'stage',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getStages' },
				default: '',
				description:
					'Pipeline stage (CRM module). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				routing: { send: { type: 'body', property: 'stage' } },
			},
		],
	},
	{
		displayName: 'Custom Fields',
		name: 'customFields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Custom Field',
		default: {},
		displayOptions: onContact('update'),
		description: 'Values of the pipeline custom fields; an empty value removes the field',
		options: [
			{
				displayName: 'Field',
				name: 'field',
				values: [
					{ displayName: 'Key', name: 'key', type: 'string', default: '', placeholder: 'budget' },
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
		routing: {
			send: {
				type: 'body',
				property: 'fields',
				value:
					'={{ Object.fromEntries(($value.field || []).filter((f) => f.key).map((f) => [f.key, f.value])) }}',
			},
		},
	},
	{
		displayName: 'Simplify',
		name: 'contactSimplify',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['contact'] } },
		description: 'Whether to return a simplified version of the response instead of the raw data',
	},
];

export const listOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['list'] } },
		options: [
			{
				name: 'Add Chat',
				value: 'addMember',
				action: 'Add a chat to a list',
				routing: {
					request: {
						method: 'POST',
						url: '/api/v1/lists/members',
						body: { session: SESSION, to: rl('listChat'), list: rl('list'), action: 'add' },
					},
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many lists',
				description: 'Lists with their number of chats',
				routing: {
					request: { method: 'GET', url: '/api/v1/lists' },
					output: { postReceive: [{ type: 'rootProperty', properties: { property: 'lists' } }] },
				},
			},
			{
				name: 'Remove Chat',
				value: 'removeMember',
				action: 'Remove a chat from a list',
				routing: {
					request: {
						method: 'POST',
						url: '/api/v1/lists/members',
						body: { session: SESSION, to: rl('listChat'), list: rl('list'), action: 'remove' },
					},
				},
			},
		],
		default: 'addMember',
	},
	locator({
		displayName: 'List',
		name: 'list',
		search: 'searchLists',
		idPlaceholder: 'cat_client',
		namePlaceholder: 'VIP customers',
		displayOptions: onList('addMember', 'removeMember'),
	}),
	locator({
		displayName: 'Chat',
		name: 'listChat',
		search: 'searchContacts',
		idPlaceholder: '33612345678',
		displayOptions: onList('addMember', 'removeMember'),
	}),
];

export const pipelineOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['pipeline'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many pipelines',
				description: 'Pipelines (Waptracks) with their stages and custom fields',
				routing: {
					request: { method: 'GET', url: '/api/v1/pipelines' },
					output: {
						postReceive: [{ type: 'rootProperty', properties: { property: 'pipelines' } }],
					},
				},
			},
		],
		default: 'getAll',
	},
];
