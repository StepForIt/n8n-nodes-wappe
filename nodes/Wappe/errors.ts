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
	miniapps_scope:
		'Records need the "Mini apps" permission (scope miniapps). In Wappe → Developers, create an API key with it, or reconnect the OAuth2 credential with Mini apps checked.',
	disabled: 'The Mini apps module is turned off in Wappe: records can be read, not changed.',
	frozen: 'This mini app is frozen (read only) in Wappe.',
	referenced: 'Another record points to this one.',
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

/** `"code":"x"` appended by Wappe to a tool error (mcp/replay.js), or the scope refusal. */
function toolErrorCode(message: string): string {
	if (/insufficient_scope/.test(message)) return /« miniapps »/.test(message) ? 'miniapps_scope' : 'insufficient_scope';
	return /"code":"(\w+)"/.exec(message)?.[1] ?? '';
}

/**
 * Answer of the MCP endpoint (`POST /api/mcp`, JSON-RPC) → n8n items. A refused tool comes back as
 * HTTP 200 with `result.isError`: it becomes a readable node error (with a hint for a key without the
 * « Mini apps » permission), never an item. Get Many returns one item per record.
 */
export async function mcpResult(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	if (response.statusCode >= 400) return sendResult.call(this, items, response);
	const body = (response.body ?? {}) as IDataObject;
	const rpcError = body.error as IDataObject | undefined;
	if (rpcError) {
		throw new NodeApiError(this.getNode(), body as JsonObject, { message: String(rpcError.message ?? 'MCP error') });
	}
	const result = (body.result ?? {}) as IDataObject;
	const content = (result.content ?? []) as IDataObject[];
	const message = content.map((c) => String(c.text ?? '')).join('\n');
	if (result.isError) {
		const code = toolErrorCode(message);
		throw new NodeApiError(this.getNode(), { error: message, code } as JsonObject, {
			message: message.replace(/\s*\{"code".*\}\s*$/, '') || 'Wappe refused the operation',
			description: [code && code !== 'miniapps_scope' && `Code: ${code}`, HINTS[code]].filter(Boolean).join('. ') || undefined,
			httpCode: code === 'miniapps_scope' || code === 'insufficient_scope' ? '403' : '400',
		});
	}
	let data = result.structuredContent as IDataObject | undefined;
	if (!data) {
		try {
			data = JSON.parse(message) as IDataObject;
		} catch {
			data = { result: message };
		}
	}
	if (Array.isArray(data.records)) return (data.records as IDataObject[]).map((json) => ({ json }));
	if (data.record && typeof data.record === 'object') return [{ json: data.record as IDataObject }];
	return [{ json: data }];
}
