import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
} from 'n8n-workflow';

type WappeContext = IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions | IWebhookFunctions;

export async function instanceUrl(this: WappeContext): Promise<string> {
	const credentials = await this.getCredentials('wappeApi');
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
	return this.helpers.httpRequestWithAuthentication.call(this, 'wappeApi', options);
}
