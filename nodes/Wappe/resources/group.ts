import type { INodeProperties } from 'n8n-workflow';

const forGroup = { resource: ['group'] };
const onGroup = (...operation: string[]) => ({ show: { ...forGroup, operation } });

const SESSION = '={{$parameter.session}}';
const CHAT = '={{$parameter.chatId}}';
const NUMBERS = '={{$parameter.numbers}}';

export const groupOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forGroup },
		options: [
			{
				name: 'Add Members',
				value: 'addMembers',
				action: 'Add members to a group',
				routing: {
					request: {
						method: 'POST',
						url: '/api/group/participants',
						body: { session: SESSION, chatId: CHAT, add: NUMBERS },
					},
				},
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a group',
				description: 'Create a WhatsApp group with its first members',
				routing: {
					request: {
						method: 'POST',
						url: '/api/group/create',
						body: { session: SESSION, participants: NUMBERS },
					},
				},
			},
			{
				name: 'Demote Admins',
				value: 'demoteAdmins',
				action: 'Remove admin rights in a group',
				routing: {
					request: {
						method: 'POST',
						url: '/api/group/admins',
						body: { session: SESSION, chatId: CHAT, demote: NUMBERS },
					},
				},
			},
			{
				name: 'Get Invite Link',
				value: 'getInviteLink',
				action: 'Get the invite link of a group',
				routing: {
					request: {
						method: 'GET',
						url: '/api/group/invite',
						qs: { session: SESSION, chatId: CHAT },
					},
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many groups',
				description: 'List the WhatsApp groups of an account',
				routing: {
					request: { method: 'GET', url: '/api/groups', qs: { session: SESSION } },
					output: { postReceive: [{ type: 'rootProperty', properties: { property: 'groups' } }] },
				},
			},
			{
				name: 'Promote Admins',
				value: 'promoteAdmins',
				action: 'Give admin rights in a group',
				description: 'Your account must be an admin of the group',
				routing: {
					request: {
						method: 'POST',
						url: '/api/group/admins',
						body: { session: SESSION, chatId: CHAT, promote: NUMBERS },
					},
				},
			},
			{
				name: 'Remove Members',
				value: 'removeMembers',
				action: 'Remove members from a group',
				routing: {
					request: {
						method: 'POST',
						url: '/api/group/participants',
						body: { session: SESSION, chatId: CHAT, remove: NUMBERS },
					},
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Rename or describe a group',
				routing: {
					request: { method: 'PATCH', url: '/api/group', body: { session: SESSION, chatId: CHAT } },
				},
			},
		],
		default: 'create',
	},
];

export const groupFields: INodeProperties[] = [
	{
		displayName: 'Group Name or ID',
		name: 'chatId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getGroups', loadOptionsDependsOn: ['session'] },
		required: true,
		default: '',
		displayOptions: onGroup(
			'addMembers',
			'removeMembers',
			'promoteAdmins',
			'demoteAdmins',
			'update',
			'getInviteLink',
		),
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
	{
		displayName: 'Group Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		displayOptions: onGroup('create'),
		routing: { send: { type: 'body', property: 'name' } },
	},
	{
		displayName: 'Phone Numbers',
		name: 'numbers',
		type: 'string',
		required: true,
		default: '',
		placeholder: '33612345678, 33698765432',
		displayOptions: onGroup(
			'create',
			'addMembers',
			'removeMembers',
			'promoteAdmins',
			'demoteAdmins',
		),
		description:
			'Comma- or newline-separated phone numbers (international format, or national with the account country code)',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: onGroup('create'),
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				routing: { send: { type: 'body', property: 'description' } },
			},
			{
				displayName: 'Welcome Message',
				name: 'welcome',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Message posted in the group right after it is created',
				routing: { send: { type: 'body', property: 'welcome' } },
			},
		],
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: onGroup('update'),
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'New description (an empty value clears it)',
				routing: { send: { type: 'body', property: 'description' } },
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'New group name (subject)',
				routing: { send: { type: 'body', property: 'name' } },
			},
		],
	},
];
