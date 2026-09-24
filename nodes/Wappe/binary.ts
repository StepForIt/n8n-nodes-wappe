import type {
	IDataObject,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	INodeExecutionData,
} from 'n8n-workflow';

/** Puts the attachment chosen in the node (URL or binary property) into the request body. */
export async function attachMedia(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const field = this.getNodeParameter('operation') === 'sendVoice' ? 'audio' : 'media';
	const body = (requestOptions.body ?? {}) as IDataObject;
	if (this.getNodeParameter('mediaSource') === 'url') {
		body[field] = { url: this.getNodeParameter('mediaUrl') as string };
	} else {
		const property = this.getNodeParameter('binaryPropertyName') as string;
		const binary = this.helpers.assertBinaryData(property);
		const buffer = await this.helpers.getBinaryDataBuffer(property);
		body[field] = {
			data: buffer.toString('base64'),
			filename: binary.fileName ?? '',
			mimetype: binary.mimeType ?? '',
		};
	}
	requestOptions.body = body;
	return requestOptions;
}

/** Turns a raw file response into a binary item, keeping the file name and type sent by Wappe. */
export async function toBinaryItem(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const headers = response.headers as IDataObject;
	const mimeType = String(headers['content-type'] ?? 'application/octet-stream')
		.split(';')[0]
		.trim();
	const disposition = String(headers['content-disposition'] ?? '');
	const match =
		/filename\*=UTF-8''([^;]+)/i.exec(disposition) ?? /filename="?([^";]+)"?/i.exec(disposition);
	const fileName = match ? decodeURIComponent(match[1]) : undefined;
	const buffer = Buffer.from(response.body as Buffer);
	const data = await this.helpers.prepareBinaryData(buffer, fileName, mimeType);
	return [
		{
			json: {
				msgId: this.getNodeParameter('msgId') as string,
				fileName,
				mimeType,
				size: buffer.length,
			},
			binary: { data },
		},
	];
}
