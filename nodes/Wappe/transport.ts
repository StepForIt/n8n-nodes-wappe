import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeCredentialDescription,
	INodeProperties,
	IWebhookFunctions,
} from 'n8n-workflow';

type WappeContext = IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions | IWebhookFunctions;

/** API key = full access; OAuth2 = only the permissions granted on the Wappe consent screen. */
export const authenticationProperty: INodeProperties = {
	displayName: 'Authentication',
	name: 'authentication',
	type: 'options',
	options: [
		{ name: 'API Key', value: 'apiKey' },
		{ name: 'OAuth2', value: 'oAuth2' },
	],
	default: 'apiKey',
};

export const wappeCredentials: INodeCredentialDescription[] = [
	{ name: 'wappeApi', required: true, displayOptions: { show: { authentication: ['apiKey'] } } },
	{ name: 'wappeOAuth2Api', required: true, displayOptions: { show: { authentication: ['oAuth2'] } } },
];

function credentialType(this: WappeContext): string {
	const read = this.getNodeParameter as (name: string, fallback: unknown) => unknown;
	const auth = 'getInputData' in this
		? (this as IExecuteFunctions).getNodeParameter('authentication', 0, 'apiKey')
		: read.call(this, 'authentication', 'apiKey');
	return auth === 'oAuth2' ? 'wappeOAuth2Api' : 'wappeApi';
}

export async function instanceUrl(this: WappeContext): Promise<string> {
	const credentials = await this.getCredentials(credentialType.call(this));
	return String(credentials.url ?? '').replace(/\/+$/, '');
}

/** Authenticated call to the Wappe instance configured in the credential. */
export async function wappeApiRequest(
	this: WappeContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
	extra: Partial<IHttpRequestOptions> = {},
) {
	const options: IHttpRequestOptions = {
		method,
		url: `${await instanceUrl.call(this)}${endpoint}`,
		json: true,
		...(body ? { body } : {}),
		...(qs ? { qs } : {}),
		...extra,
	};
	return this.helpers.httpRequestWithAuthentication.call(this, credentialType.call(this), options);
}
