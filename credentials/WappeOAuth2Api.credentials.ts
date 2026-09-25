import type { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

const SCOPES = [
	{ name: 'Send Messages', value: 'messages:send' },
	{ name: 'Read Conversations', value: 'messages:read' },
	{ name: 'Read Contacts', value: 'contacts:read' },
	{ name: 'Update Contacts', value: 'contacts:write' },
	{ name: 'Lists', value: 'lists' },
	{ name: 'WhatsApp Groups', value: 'groups' },
	{ name: 'Webhooks (Trigger)', value: 'webhooks' },
	{ name: 'Usage', value: 'usage' },
];

export class WappeOAuth2Api implements ICredentialType {
	name = 'wappeOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'Wappe OAuth2 API';

	icon: Icon = { light: 'file:../icons/wappe.svg', dark: 'file:../icons/wappe.dark.svg' };

	documentationUrl = 'https://github.com/StepForIt/n8n-nodes-wappe#oauth2';

	properties: INodeProperties[] = [
		{
			displayName: 'Instance URL',
			name: 'url',
			type: 'string',
			default: '',
			placeholder: 'https://wappe.example.com',
			required: true,
			description: 'Address of your Wappe instance, as you open it in the browser',
		},
		{
			displayName: 'Permissions',
			name: 'scopes',
			type: 'multiOptions',
			options: SCOPES,
			default: SCOPES.map((s) => s.value),
			description:
				'What n8n may do on your Wappe instance. An administrator grants them on the consent screen.',
		},
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'pkce',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: '={{$self["url"].replace(/\\/+$/, "")}}/oauth/authorize',
			required: true,
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: '={{$self["url"].replace(/\\/+$/, "")}}/oauth/token',
			required: true,
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '={{[].concat($self["scopes"]).join(" ")}}',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url.replace(/\\/+$/, "")}}',
			url: '/api/me',
			method: 'GET',
		},
	};
}
