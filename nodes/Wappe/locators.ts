import type { INodeProperties } from 'n8n-workflow';

/**
 * Value of a resource locator in a routing expression. Workflows saved before 0.3.0 hold a plain
 * string in the same parameter: `?? $parameter.x` keeps them working.
 */
export const rl = (name: string) => `={{ $parameter.${name}?.value ?? $parameter.${name} }}`;

type LocatorOptions = {
	displayName: string;
	name: string;
	search: string;
	idPlaceholder: string;
	namePlaceholder?: string;
	required?: boolean;
	description?: string;
	displayOptions?: INodeProperties['displayOptions'];
};

/** « From list » (searchable) / « By ID » / « By name » - the server resolves ids and names alike. */
export function locator(o: LocatorOptions): INodeProperties {
	return {
		displayName: o.displayName,
		name: o.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: o.required ?? true,
		...(o.description ? { description: o.description } : {}),
		...(o.displayOptions ? { displayOptions: o.displayOptions } : {}),
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: o.search, searchable: true },
			},
			{ displayName: 'By ID', name: 'id', type: 'string', placeholder: o.idPlaceholder },
			...(o.namePlaceholder
				? [
						{
							displayName: 'By Name',
							name: 'name',
							type: 'string' as const,
							placeholder: o.namePlaceholder,
						},
					]
				: []),
		],
	};
}

/** The account used; declared once per resource group so that it only shows where it is needed. */
export const accountLocator = (displayOptions: INodeProperties['displayOptions']) =>
	locator({
		displayName: 'Account',
		name: 'session',
		search: 'searchAccounts',
		idPlaceholder: 'default',
		namePlaceholder: 'Shop',
		description: 'The WhatsApp or Instagram account used',
		displayOptions,
	});
