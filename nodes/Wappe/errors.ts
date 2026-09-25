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
	send_rate:
		'The WhatsApp account has no free sending slot in the next 15 s (Wappe spaces automatic sends). For bulk sends, turn on Options → Queue Sending.',
	rate_limited: 'Too many requests with this credential. Use Settings → Retry On Fail, or slow the workflow down.',
	daily_quota: "The instance's daily API quota is reached (API plan). It resets at midnight UTC.",
	insufficient_scope: 'This credential does not have the permission needed. Create an API key or grant OAuth2 access with it.',
};

/** « Retry after 42 s » from the Retry-After header (or the body's retryAfter), when Wappe gives one. */
function retryHint(response: IN8nHttpFullResponse, body: IDataObject): string {
	const headers = (response.headers ?? {}) as IDataObject;
	const seconds = Number(headers['retry-after'] ?? body.retryAfter);
	return seconds > 0 ? `Retry after ${Math.ceil(seconds)} s` : '';
}

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
		description: [code && `Code: ${code}`, HINTS[code], retryHint(response, body)].filter(Boolean).join('. ') || undefined,
		httpCode: String(response.statusCode),
	});
}
