import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';
import { wappeApiRequest } from './transport';

type Named = { id: string; name: string };

/** Current value of a locator/options parameter of the node (the session the lists depend on). */
function currentValue(this: ILoadOptionsFunctions, name: string): string {
	const v = this.getCurrentNodeParameter(name) as IDataObject | string | undefined;
	return String((v && typeof v === 'object' ? v.value : v) ?? '');
}

const get = (ctx: ILoadOptionsFunctions, path: string, qs: IDataObject) =>
	wappeApiRequest.call(ctx, 'GET', path, undefined, qs) as Promise<IDataObject>;

export async function searchAccounts(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { accounts = [] } = (await get(this, '/api/v1/accounts', { search: filter ?? '' })) as {
		accounts?: Array<{ name: string; label: string; status: string }>;
	};
	return {
		results: accounts.map((a) => ({
			name: `${a.label}${a.status && a.status !== 'WORKING' ? ` (${a.status})` : ''}`,
			value: a.name,
		})),
	};
}

export async function searchTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { templates = [] } = (await get(this, '/api/v1/templates', {
		search: filter ?? '',
		simple: true,
	})) as { templates?: Named[] };
	return { results: templates.map((t) => ({ name: t.name || t.id, value: t.id })) };
}

export async function searchGroups(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const session = currentValue.call(this, 'session');
	if (!session) return { results: [] };
	const { groups = [] } = (await get(this, '/api/v1/groups', {
		session,
		search: filter ?? '',
	})) as {
		groups?: Array<{ chatId: string; name: string }>;
	};
	return { results: groups.map((g) => ({ name: g.name || g.chatId, value: g.chatId })) };
}

export async function searchLists(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { lists = [] } = (await get(this, '/api/v1/lists', { search: filter ?? '' })) as {
		lists?: Array<Named & { count: number }>;
	};
	return { results: lists.map((l) => ({ name: `${l.name} (${l.count})`, value: l.id })) };
}

export async function searchContacts(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const session = currentValue.call(this, 'session');
	const { contacts = [], nextCursor } = (await get(this, '/api/v1/contacts', {
		search: filter ?? '',
		simple: true,
		limit: 50,
		...(session ? { session } : {}),
		...(paginationToken ? { cursor: paginationToken } : {}),
	})) as { contacts?: Array<{ chatId: string; name: string; phone: string }>; nextCursor?: string };
	return {
		results: contacts.map((c) => ({
			name: c.name ? `${c.name}${c.phone ? ` (+${c.phone})` : ''}` : c.phone || c.chatId,
			value: c.chatId,
		})),
		paginationToken: nextCursor ?? undefined,
	};
}

export async function searchStages(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { pipelines = [] } = (await get(this, '/api/v1/pipelines', { search: filter ?? '' })) as {
		pipelines?: Array<Named & { stages: Named[] }>;
	};
	const many = pipelines.length > 1;
	return {
		results: pipelines.flatMap((pl) =>
			pl.stages.map((s) => ({ name: many ? `${pl.name} › ${s.name}` : s.name, value: s.id })),
		),
	};
}

/** Stages as plain options (inside a collection, where a locator is not available). */
export async function getStages(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return (await searchStages.call(this)).results.map((r) => ({ name: r.name, value: r.value }));
}
