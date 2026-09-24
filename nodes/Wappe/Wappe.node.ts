import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { getAccounts, getGroups, getTemplates } from './loadOptions';
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
					{ name: 'Group', value: 'group' },
					{ name: 'Message', value: 'message' },
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
			{
				displayName: 'Account Name or ID',
				name: 'session',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAccounts' },
				required: true,
				default: '',
				displayOptions: { show: { resource: ['message', 'group', 'chat'] } },
				description:
					'Account the message is sent from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			...messageFields,
			...groupFields,
		],
	};

	methods = {
		loadOptions: { getAccounts, getGroups, getTemplates },
	};
}
