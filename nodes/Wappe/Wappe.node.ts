import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import {
	getStages,
	searchAccounts,
	searchContacts,
	searchGroups,
	searchLists,
	searchStages,
	searchTemplates,
} from './listSearch';
import { accountLocator } from './locators';
import { contactOperations, listOperations, pipelineOperations } from './resources/crm';
import { groupFields, groupOperations } from './resources/group';
import {
	accountOperations,
	chatOperations,
	templateOperations,
	usageOperations,
} from './resources/lookup';
import { messageFields, messageOperations } from './resources/message';

export class Wappe implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Wappe',
		name: 'wappe',
		icon: { light: 'file:../../icons/wappe.svg', dark: 'file:../../icons/wappe.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send and read WhatsApp messages, manage groups and follow usage with Wappe',
		defaults: { name: 'Wappe' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'wappeApi', required: true }],
		requestDefaults: {
			baseURL: '={{$credentials.url.replace(/\\/+$/, "")}}',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Chat', value: 'chat' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Group', value: 'group' },
					{ name: 'List', value: 'list' },
					{ name: 'Message', value: 'message' },
					{ name: 'Pipeline', value: 'pipeline' },
					{ name: 'Template', value: 'template' },
					{ name: 'Usage', value: 'usage' },
				],
				default: 'message',
			},
			...messageOperations,
			...groupOperations,
			...accountOperations,
			...templateOperations,
			...chatOperations,
			...usageOperations,
			...contactOperations.slice(0, 1),
			...listOperations.slice(0, 1),
			...pipelineOperations,
			accountLocator({ show: { resource: ['message', 'group', 'chat'] } }),
			accountLocator({ show: { resource: ['contact'], operation: ['get', 'update'] } }),
			accountLocator({ show: { resource: ['list'], operation: ['addMember', 'removeMember'] } }),
			...contactOperations.slice(1),
			...listOperations.slice(1),
			...messageFields,
			...groupFields,
		],
	};

	methods = {
		loadOptions: { getStages },
		listSearch: {
			searchAccounts,
			searchContacts,
			searchGroups,
			searchLists,
			searchStages,
			searchTemplates,
		},
	};
}
