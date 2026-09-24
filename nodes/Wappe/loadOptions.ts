import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { wappeApiRequest } from './transport';

type Account = { name: string; label?: string; channel?: string; status?: string };
type Template = { id: string; name: string };
type Group = { chatId: string; name: string };

export async function getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const res = (await wappeApiRequest.call(this, 'GET', '/api/me')) as { accounts?: Account[] };
	return (res.accounts ?? []).map((a) => ({
		name: `${a.label || a.name}${a.status && a.status !== 'WORKING' ? ` (${a.status})` : ''}`,
		value: a.name,
		description: a.channel,
	}));
}

export async function getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const res = (await wappeApiRequest.call(this, 'GET', '/api/templates')) as {
		templates?: Template[];
	};
	return (res.templates ?? [])
		.map((t) => ({ name: t.name || t.id, value: t.id }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const session = this.getCurrentNodeParameter('session') as string | undefined;
	if (!session) return [];
	const res = (await wappeApiRequest.call(this, 'GET', '/api/groups', undefined, { session })) as {
		groups?: Group[];
	};
	return (res.groups ?? [])
		.map((g) => ({ name: g.name || g.chatId, value: g.chatId }))
		.sort((a, b) => a.name.localeCompare(b.name));
}
