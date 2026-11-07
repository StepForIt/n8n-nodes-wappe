import type {
	IDataObject,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { mcpResult } from '../errors';

/**
 * Records (« fiches ») of the instance's mini apps. Wappe opens them to integrations through its MCP
 * endpoint only (`POST /api/mcp`, tools `records_*`, permission « Mini apps »): the node sends one
 * JSON-RPC `tools/call` per item and unwraps the tool's result (errors.ts → mcpResult).
 */
const forRecord = { resource: ['record'] };
const onRecord = (...operation: string[]) => ({ show: { ...forRecord, operation } });

/** Operation → MCP tool (app/src/mcp/tools.js). */
export const RECORD_TOOLS: Record<string, string> = {
	getAll: 'records_list',
	create: 'records_create',
	update: 'records_update',
	assign: 'records_assign',
};

const MCP_ROUTING = {
	send: { preSend: [recordRequest] },
	request: {
		method: 'POST' as const,
		url: '/api/mcp',
		body: { jsonrpc: '2.0', method: 'tools/call' },
		ignoreHttpStatusErrors: true,
	},
	output: { postReceive: [mcpResult] },
};

export const recordOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forRecord },
		options: [
			{
				name: 'Assign',
				value: 'assign',
				action: 'Assign a record',
				description: 'Assign a record to a contact or an agent, or offer it to a list (opens the dedicated WhatsApp group if the app says so)',
				routing: MCP_ROUTING,
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a record',
				description: 'Create a record in a mini app (runs its hooks and the automations watching records)',
				routing: MCP_ROUTING,
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many records',
				description: 'Read the records of a mini app, with filters',
				routing: MCP_ROUTING,
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a record',
				description: 'Change the title, status or fields of a record (only what you set)',
				routing: MCP_ROUTING,
			},
		],
		default: 'getAll',
	},
];

export const recordFields: INodeProperties[] = [
	{
		displayName: 'Mini App',
		name: 'app',
		type: 'string',
		required: true,
		default: 'ot',
		placeholder: 'ot',
		description: 'ID of the mini app (Wappe → Mini apps). "ot" = Work orders, shipped with Wappe.',
		displayOptions: { show: forRecord },
	},
	{
		displayName: 'Entity',
		name: 'entity',
		type: 'string',
		default: '',
				description: 'Key of the record type inside the app. Empty = the first one.',
		displayOptions: { show: forRecord },
	},
	{
		displayName: 'Record ID',
		name: 'recordId',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the record, as returned by Get Many or Create',
		displayOptions: onRecord('update', 'assign'),
	},
	// ── Get Many ──
	{
		displayName: 'State',
		name: 'open',
		type: 'options',
		options: [
			{ name: 'All', value: 'all' },
			{ name: 'Open Only', value: 'open', description: 'Records without a final status' },
			{ name: 'Closed Only', value: 'closed', description: 'Records with a final status' },
		],
		default: 'all',
		displayOptions: onRecord('getAll'),
	},
	{
		displayName: 'Filter (JSON)',
		name: 'where',
		type: 'json',
		default: '{}',
		description: 'Records whose values match, e.g. {"status": "a_planifier", "assignee.uid": "u1", "client": "Dupont"}',
		displayOptions: onRecord('getAll'),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 500 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: onRecord('getAll'),
	},
	// ── Create / Update ──
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		displayOptions: onRecord('create', 'update'),
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'string',
		default: '',
		placeholder: 'a_planifier',
		description: 'Key of a status declared by the app. Empty = the app\'s first status (Create) or unchanged (Update).',
		displayOptions: onRecord('create', 'update'),
	},
	{
		displayName: 'Fields (JSON)',
		name: 'fields',
		type: 'json',
		default: '{}',
		description: 'Values by field key, as declared by the app, e.g. {"adresse": "12 rue de la Paix", "montant": 120}',
		displayOptions: onRecord('create', 'update'),
	},
	// ── Assign ──
	{
		displayName: 'Assign To',
		name: 'person',
		type: 'string',
		default: '',
		placeholder: '33612345678',
		description: 'A phone number or chat ID, "agent:UID", "list:ID" or the exact name of a list. Empty = unassign.',
		displayOptions: onRecord('assign'),
	},
	{
		displayName: 'Options',
		name: 'assignOptions',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: onRecord('assign'),
		options: [
			{
				displayName: 'Intro Message',
				name: 'intro',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description: 'First message of the dedicated WhatsApp group, instead of the app\'s default one',
			},
			{
				displayName: 'Notify',
				name: 'notify',
				type: 'boolean',
				default: true,
				description: 'Whether to tell the assignee on WhatsApp',
			},
			{
				displayName: 'Open WhatsApp Group',
				name: 'group',
				type: 'boolean',
				default: true,
				description: 'Whether to open the dedicated WhatsApp group when the app asks for one',
			},
		],
	},
];

/** A JSON parameter: object as typed in the editor, or a JSON string from an expression. */
function jsonParam(ctx: IExecuteSingleFunctions, name: string): IDataObject {
	const raw = ctx.getNodeParameter(name, {}) as unknown;
	let value = raw;
	if (typeof raw === 'string') {
		if (!raw.trim()) return {};
		try {
			value = JSON.parse(raw);
		} catch {
			throw new NodeOperationError(ctx.getNode(), `${name}: valid JSON expected`, { itemIndex: ctx.getItemIndex() });
		}
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new NodeOperationError(ctx.getNode(), `${name}: a JSON object expected, e.g. {"key": "value"}`, { itemIndex: ctx.getItemIndex() });
	}
	return value as IDataObject;
}

const text = (ctx: IExecuteSingleFunctions, name: string) => String(ctx.getNodeParameter(name, '') ?? '').trim();

/** The tool's arguments, only what is set (an empty field never erases a value in Wappe). */
export function recordArguments(ctx: IExecuteSingleFunctions): IDataObject {
	const operation = ctx.getNodeParameter('operation') as string;
	const args: IDataObject = { app: text(ctx, 'app') || 'ot' };
	const entity = text(ctx, 'entity');
	if (entity) args.entity = entity;
	if (operation === 'getAll') {
		const where = jsonParam(ctx, 'where');
		if (Object.keys(where).length) args.where = where;
		const open = ctx.getNodeParameter('open', 'all');
		if (open !== 'all') args.open = open === 'open';
		args.limit = Number(ctx.getNodeParameter('limit', 50)) || 50;
		return args;
	}
	const own: IDataObject = {};
	const title = text(ctx, 'title');
	const status = text(ctx, 'status');
	if (operation === 'create' || operation === 'update') {
		if (title) own.title = title;
		if (status) own.status = status;
		const fields = jsonParam(ctx, 'fields');
		if (Object.keys(fields).length) own.fields = fields;
	}
	if (operation === 'create') return { ...args, ...own };
	args.id = text(ctx, 'recordId');
	if (operation === 'update') {
		if (!Object.keys(own).length) {
			throw new NodeOperationError(ctx.getNode(), 'Nothing to update: set a title, a status or fields', { itemIndex: ctx.getItemIndex() });
		}
		return { ...args, patch: own };
	}
	// assign
	const person = text(ctx, 'person');
	args.person = person || null;
	const o = ctx.getNodeParameter('assignOptions', {}) as IDataObject;
	if (o.group === false) args.group = false;
	if (o.notify === false) args.notify = false;
	if (typeof o.intro === 'string' && o.intro.trim()) args.intro = o.intro;
	return args;
}

/** JSON-RPC `tools/call` for the current operation and item. */
export async function recordRequest(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const operation = this.getNodeParameter('operation') as string;
	requestOptions.body = {
		jsonrpc: '2.0',
		id: this.getItemIndex() + 1,
		method: 'tools/call',
		params: { name: RECORD_TOOLS[operation], arguments: recordArguments(this) },
	};
	return requestOptions;
}
