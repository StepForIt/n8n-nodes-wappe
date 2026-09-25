import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

/**
 * Queued send: gives the request an idempotency key unless one was set. It is stable across the
 * node's own retries (same execution, node and item), so a retried call returns the same job
 * instead of sending the message twice.
 */
export async function withIdempotencyKey(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const body = (requestOptions.body ?? {}) as IDataObject;
	if (body.async === true && !body.idempotencyKey) {
		body.idempotencyKey = `n8n-${this.getExecutionId()}-${this.getNode().name}-${this.getItemIndex()}`;
	}
	requestOptions.body = body;
	return requestOptions;
}
