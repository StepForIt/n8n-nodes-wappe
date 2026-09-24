import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WappeApi implements ICredentialType {
	name = 'wappeApi';

	displayName = 'Wappe API';

	icon: Icon = { light: 'file:../icons/wappe.svg', dark: 'file:../icons/wappe.dark.svg' };

	documentationUrl =
		'https://github.com/StepForIt/n8n-nodes-wappe#credentials';

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
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'API token shown on the Developers page of your Wappe instance (requires the Developers module)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-Api-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.url.replace(/\\/+$/, "")}}',
			url: '/api/me',
			method: 'GET',
		},
	};
}
