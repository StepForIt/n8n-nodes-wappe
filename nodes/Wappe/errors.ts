import type {
	IDataObject,
	IExecuteSingleFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/** What each first-contact refusal means for the workflow author. */
const HINTS: Record<string, string> = {
	consent_required:
		'This contact has never exchanged a message with you. Turn on "Contact Has Consented" only if they agreed to be contacted.',
	opted_out: 'This contact replied STOP. Wappe will not open a conversation with them.',
	daily_limit: 'Daily limit of new conversations reached. Retry tomorrow.',
	rate_limit: 'Too many new conversations in a row. Wait before the next one.',
};

/**
 * Send requests run with `ignoreHttpStatusErrors`: n8n's default error hides Wappe's message and
 * `code` behind a generic text ("Forbidden - perhaps check your credentials?" for a STOP).
 */
export async function sendResult(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const body = (response.body ?? {}) as IDataObject;
	if (response.statusCode < 400) return [{ json: body }];
	const code = typeof body.code === 'string' ? body.code : '';
	throw new NodeApiError(this.getNode(), body as JsonObject, {
		message: String(body.error ?? `Wappe answered ${response.statusCode}`),
		description: [code && `Code: ${code}`, HINTS[code]].filter(Boolean).join('. ') || undefined,
		httpCode: String(response.statusCode),
	});
}
