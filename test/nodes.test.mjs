// Tests unitaires des nœuds, sur le build (dist/) : `npm test` construit d'abord.
//
// Le test de CONTRAT confronte chaque opération déclarative au spec OpenAPI généré par le serveur
// Wappe (app/src/api-docs.js, la source unique de la doc) : route + méthode existantes, ouvertes au
// jeton, champs envoyés connus du schéma, champs requis tous envoyés. Hors du monorepo (paquet
// extrait seul), il se saute proprement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const { Wappe } = require('../dist/nodes/Wappe/Wappe.node.js');
const { WappeTrigger, isValidSignature } = require('../dist/nodes/WappeTrigger/WappeTrigger.node.js');
const { WappeApi } = require('../dist/credentials/WappeApi.credentials.js');
const { WappeOAuth2Api } = require('../dist/credentials/WappeOAuth2Api.credentials.js');
const { searchAccounts, searchGroups, searchTemplates, searchContacts, searchStages } = require('../dist/nodes/Wappe/listSearch.js');

const API_DOCS = join(HERE, '..', '..', '..', 'app', 'src', 'api-docs.js');
const OAUTH_SCOPES = join(HERE, '..', '..', '..', 'app', 'src', 'oauth-scopes.js');

// ── Lecture des opérations déclaratives ──
const visibleFor = (prop, resource, operation) => {
	const show = prop.displayOptions?.show ?? {};
	if (show.resource && !show.resource.includes(resource)) return false;
	if (show.operation && !show.operation.includes(operation)) return false;
	return true;
};
// Champs posés par un preSend (pièce jointe lue dans le nœud) : invisibles dans la description statique.
const PRESEND_FIELDS = { sendMedia: ['media'], sendVoice: ['audio'] };
const exprKey = (v) => /\$parameter\.(\w+)/.exec(String(v))?.[1];
const isExpr = (v) => String(v).startsWith('=');

function operations(description) {
	const out = [];
	for (const prop of description.properties) {
		if (prop.name !== 'operation') continue;
		const resource = prop.displayOptions.show.resource[0];
		for (const opt of prop.options) {
			const fields = description.properties.filter(
				(p) => p.name !== 'operation' && visibleFor(p, resource, opt.value),
			);
			const sent = new Set([...Object.keys(opt.routing.request.body ?? {}), ...(PRESEND_FIELDS[opt.value] ?? [])]);
			for (const f of fields) {
				if (f.routing?.send?.type === 'body') sent.add(f.routing.send.property);
				for (const sub of f.options ?? []) {
					if (sub.routing?.send?.type === 'body') sent.add(sub.routing.send.property);
				}
			}
			out.push({ resource, operation: opt.value, option: opt, fields, sent });
		}
	}
	return out;
}

// URL à paramètre de chemin (« =/api/v1/jobs/{{$parameter.jobId}} ») → chemin OpenAPI (« /api/v1/jobs/{id} »).
const specPath = (url) => (String(url).startsWith('=') ? url.slice(1).replace(/\{\{[^}]+\}\}/g, '{id}') : url);

const node = new Wappe();
const OPS = operations(node.description);

test('chaque ressource a ses opérations, et toutes passent par une route déclarée', () => {
	assert.deepEqual(
		OPS.map((o) => `${o.resource}:${o.operation}`).sort(),
		[
			'account:getAll',
			'chat:markRead',
			'contact:get',
			'contact:getAll',
			'contact:update',
			'group:addMembers',
			'group:create',
			'group:demoteAdmins',
			'group:getAll',
			'group:getInviteLink',
			'group:promoteAdmins',
			'group:removeMembers',
			'group:update',
			'list:addMember',
			'list:getAll',
			'list:removeMember',
			'message:deleteMessage',
			'message:downloadMedia',
			'message:editMessage',
			'message:getAll',
			'message:getJob',
			'message:react',
			'message:sendMedia',
			'message:sendTemplate',
			'message:sendText',
			'message:sendVoice',
			'message:transcribe',
			'pipeline:getAll',
			'template:getAll',
			'usage:get',
		],
	);
	for (const o of OPS) {
		assert.ok(specPath(o.option.routing.request.url).startsWith('/api/'), `${o.operation} : url relative`);
		for (const [k, v] of Object.entries({ ...o.option.routing.request.body, ...o.option.routing.request.qs })) {
			if (!isExpr(v)) continue;   // valeur fixe (ex. action: 'add')
			const param = exprKey(v);
			assert.ok(param, `${o.operation}.${k} doit lire un paramètre du nœud`);
			assert.ok(
				o.fields.some((f) => f.name === param),
				`${o.operation} : le paramètre ${param} doit être visible pour cette opération`,
			);
		}
	}
});

test('contrat avec le spec OpenAPI de Wappe (routes, jeton, champs)', { skip: !existsSync(API_DOCS) && 'hors monorepo' }, async () => {
	const { openApiSpec, docPublicIds } = await import(pathToFileURL(API_DOCS).href);
	const spec = openApiSpec({ ids: docPublicIds() });
	for (const o of OPS) {
		const { method } = o.option.routing.request;
		const url = specPath(o.option.routing.request.url);
		const op = spec.paths[url]?.[method.toLowerCase()];
		assert.ok(op, `${method} ${url} (${o.resource}:${o.operation}) absent du spec OpenAPI client`);
		assert.ok(
			op.security.some((s) => 'ApiKeyAuth' in s),
			`${method} ${url} doit accepter le jeton X-Api-Key`,
		);
		const schema = op.requestBody?.content?.['application/json']?.schema;
		if (schema) {
			for (const k of o.sent) assert.ok(k in schema.properties, `${url} : champ ${k} inconnu du schéma`);
			for (const k of schema.required ?? []) {
				assert.ok(o.sent.has(k), `${o.resource}:${o.operation} n'envoie pas le champ requis ${k}`);
			}
		}
		const qs = Object.keys(o.option.routing.request.qs ?? {});
		const params = op.parameters ?? [];
		for (const k of qs) assert.ok(params.some((p) => p.name === k), `${url} : paramètre ${k} inconnu`);
		for (const p of params.filter((x) => x.required && x.in === 'query')) {
			assert.ok(qs.includes(p.name), `${url} : paramètre requis ${p.name} non envoyé`);
		}
	}
	for (const path of ['/api/me', '/api/webhooks/subscriptions', '/api/webhooks/subscriptions/{id}', '/api/media/{id}']) {
		assert.ok(spec.paths[path], `${path} (credential / trigger) absent du spec`);
	}
});

test('credential : en-tête X-Api-Key, test sur GET /api/me, URL sans slash final', () => {
	const cred = new WappeApi();
	assert.equal(cred.name, 'wappeApi');
	assert.equal(cred.authenticate.properties.headers['X-Api-Key'], '={{$credentials.apiKey}}');
	assert.equal(cred.test.request.url, '/api/me');
	assert.equal(cred.test.request.method, 'GET');
	assert.equal(
		cred.properties.find((p) => p.name === 'apiKey').typeOptions.password,
		true,
		'la clé est un champ mot de passe',
	);
});

test('credential OAuth2 : PKCE, URLs dérivées de l\'instance, tous les droits par défaut', () => {
	const cred = new WappeOAuth2Api();
	assert.equal(cred.name, 'wappeOAuth2Api');
	assert.deepEqual(cred.extends, ['oAuth2Api']);
	const prop = (name) => cred.properties.find((p) => p.name === name);
	assert.equal(prop('grantType').default, 'pkce');
	assert.match(prop('authUrl').default, /\$self\["url"\].*\/oauth\/authorize$/);
	assert.match(prop('accessTokenUrl').default, /\$self\["url"\].*\/oauth\/token$/);
	assert.deepEqual(prop('permissions').default, prop('permissions').options.map((o) => o.value));
	assert.equal(prop('scopes'), undefined, 'nom réservé par n8n (droits RBAC du credential)');
	assert.match(prop('scope').default, /\$self\["permissions"\]/);
	assert.equal(cred.test.request.url, '/api/me');
	for (const node of [new Wappe(), new WappeTrigger()]) {
		const auth = node.description.properties.find((p) => p.name === 'authentication');
		assert.equal(auth?.default, 'apiKey', `${node.description.name} : clé API par défaut`);
		assert.deepEqual(node.description.credentials.map((c) => [c.name, c.displayOptions.show.authentication[0]]), [['wappeApi', 'apiKey'], ['wappeOAuth2Api', 'oAuth2']]);
	}
});

test('contrat OAuth2 : scopes du credential = scopes du serveur, chaque opération en exige un', { skip: !existsSync(API_DOCS) && 'hors monorepo' }, async () => {
	const { SCOPES, ANY, integrationRoute } = await import(pathToFileURL(OAUTH_SCOPES).href);
	const offered = new WappeOAuth2Api().properties.find((p) => p.name === 'permissions').options.map((o) => o.value);
	assert.deepEqual(offered.sort(), Object.keys(SCOPES).sort());
	// Sans charger le serveur : la table des routes d'intégration suffit (le scope de chaque route
	// /api/v1 est vérifié côté serveur, test/unit/oauth-scopes.test.mjs).
	const { openApiSpec, docPublicIds, setScopeResolver } = await import(pathToFileURL(API_DOCS).href);
	setScopeResolver((m, path) => { const r = integrationRoute(m, path); return r ? (r[3] === 'v1' ? ANY : r[3]) : null; });
	const spec = openApiSpec({ ids: docPublicIds() });
	for (const o of OPS) {
		const { method } = o.option.routing.request;
		const url = specPath(o.option.routing.request.url);
		const op = spec.paths[url][method.toLowerCase()];
		assert.ok(Array.isArray(op['x-oauth-scopes']), `${method} ${url} : ouvert à OAuth2`);
		for (const sc of op['x-oauth-scopes']) assert.ok(offered.includes(sc), `${url} : scope ${sc} proposé par le credential`);
	}
});

test('transport : le choix « OAuth2 » appelle avec le credential OAuth2', async () => {
	const ctx = fakeContext({ params: { authentication: 'oAuth2' }, staticData: { subscriptionId: 'sub_1', secret: 's' }, responses: { 'GET /api/webhooks/subscriptions': { subscriptions: [{ id: 'sub_1', url: 'https://n8n.test/webhook/abc/webhook' }] } } });
	assert.equal(await new WappeTrigger().webhookMethods.default.checkExists.call(ctx), true);
	assert.equal(ctx.calls[0].credType, 'wappeOAuth2Api');
});

// Garde-fou : n8n enregistre la version d'un nœud communautaire dans `installed_nodes.latestVersion`,
// une colonne INTEGER sur les bases Postgres créées par d'anciennes versions de n8n. Une version 1.1
// y fait échouer l'installation du paquet entier (« invalid input syntax for type integer », 0.5.0).
// Chaque nœud déclaré dans package.json est vérifié, y compris ceux ajoutés plus tard.
test('versions de nœud entières (installation sur n8n + Postgres)', () => {
	const pkg = require('../package.json');
	assert.ok(pkg.n8n.nodes.length >= 2);
	for (const file of pkg.n8n.nodes) {
		const mod = require(join(HERE, '..', file));
		for (const Node of Object.values(mod).filter((x) => typeof x === 'function' && /^class /.test(String(x)))) {
			const d = new Node().description;
			if (!d) continue;
			for (const v of [d.version].flat()) assert.ok(Number.isInteger(v), `${d.name} : version ${v} non entière`);
			if (d.defaultVersion !== undefined) assert.ok(Number.isInteger(d.defaultVersion), `${d.name} : defaultVersion ${d.defaultVersion} non entière`);
		}
	}
});

// ── Contextes n8n factices ──
function fakeContext({ params = {}, responses = {}, staticData = {}, webhookUrl = 'https://n8n.test/webhook/abc/webhook' } = {}) {
	const calls = [];
	const ctx = {
		calls,
		staticData,
		getCredentials: async () => ({ url: 'https://wappe.test/', apiKey: 'wtk_x' }),
		getNodeParameter: (name, fallback) => (name in params ? params[name] : fallback),
		getCurrentNodeParameter: (name) => params[name],
		getWorkflowStaticData: () => staticData,
		getNodeWebhookUrl: () => webhookUrl,
		getWorkflow: () => ({ id: 'wf1' }),
		getNode: () => ({ name: 'Wappe Trigger', type: 'wappeTrigger', typeVersion: 1, parameters: {} }),
		helpers: {
			httpRequestWithAuthentication: async (credType, options) => {
				calls.push({ credType, ...options });
				const key = `${options.method} ${options.url.replace('https://wappe.test', '')}`;
				const r = responses[key];
				if (typeof r === 'function') return r(options);
				if (r === undefined) throw new Error(`appel inattendu : ${key}`);
				return r;
			},
			prepareBinaryData: async (buffer, fileName, mimeType) => ({
				data: Buffer.from(buffer).toString('base64'),
				fileName,
				mimeType,
			}),
		},
	};
	return ctx;
}

test('sélecteurs : recherche comptes, modèles, groupes (dépend du compte), contacts paginés, étapes', async () => {
	const ctx = fakeContext({
		params: { session: { __rl: true, mode: 'list', value: 'shop' } },
		responses: {
			'GET /api/v1/accounts': { accounts: [{ name: 'shop', label: 'Boutique', status: 'WORKING' }, { name: 'perso', label: 'perso', status: 'SCAN_QR_CODE' }] },
			'GET /api/v1/templates': { templates: [{ id: 't1', name: 'Bienvenue' }] },
			'GET /api/v1/groups': { groups: [{ chatId: '1@g.us', name: 'Club' }] },
			'GET /api/v1/contacts': { contacts: [{ chatId: '336@c.us', name: 'Camille', phone: '336' }], nextCursor: '50' },
			'GET /api/v1/pipelines': { pipelines: [{ id: 'p1', name: 'Ventes', stages: [{ id: 's1', name: 'Devis' }] }, { id: 'p2', name: 'SAV', stages: [{ id: 's2', name: 'Ouvert' }] }] },
		},
	});
	assert.deepEqual((await searchAccounts.call(ctx, 'bou')).results, [{ name: 'Boutique', value: 'shop' }, { name: 'perso (SCAN_QR_CODE)', value: 'perso' }]);
	assert.deepEqual((await searchTemplates.call(ctx)).results, [{ name: 'Bienvenue', value: 't1' }]);
	assert.deepEqual((await searchGroups.call(ctx, 'cl')).results, [{ name: 'Club', value: '1@g.us' }]);
	const groupsCall = ctx.calls.find((c) => c.url.endsWith('/api/v1/groups'));
	assert.deepEqual(groupsCall.qs, { session: 'shop', search: 'cl' }, 'le compte vient du sélecteur');
	const contacts = await searchContacts.call(ctx, 'cam');
	assert.deepEqual(contacts, { results: [{ name: 'Camille (+336)', value: '336@c.us' }], paginationToken: '50' });
	assert.deepEqual((await searchStages.call(ctx)).results.map((r) => r.name), ['Ventes › Devis', 'SAV › Ouvert']);
	assert.equal(ctx.calls[0].url, 'https://wappe.test/api/v1/accounts', 'slash final de l’URL retiré');
	assert.ok(ctx.calls.every((c) => c.credType === 'wappeApi'));
});

test('trigger : create → abonnement enregistré (id + secret), checkExists, delete tolérant au 404', async () => {
	const trigger = new WappeTrigger();
	const hooks = trigger.webhookMethods.default;
	const staticData = {};
	let deleteStatus = 200;
	const ctx = fakeContext({
		staticData,
		params: { event: 'message.received', includeGroups: true },
		responses: {
			'POST /api/webhooks/subscriptions': (o) => ({ id: 'sub_1', secret: 'whsec_1', url: o.body.url }),
			'GET /api/webhooks/subscriptions': { subscriptions: [{ id: 'sub_1', url: 'https://n8n.test/webhook/abc/webhook' }] },
			'DELETE /api/webhooks/subscriptions/sub_1': () => ({ statusCode: deleteStatus, body: {} }),
		},
	});

	assert.equal(await hooks.checkExists.call(ctx), false, 'rien en mémoire : pas d’abonnement');
	assert.equal(await hooks.create.call(ctx), true);
	const created = ctx.calls.at(-1);
	assert.deepEqual(created.body, {
		url: 'https://n8n.test/webhook/abc/webhook',
		events: ['message.received'],
		includeGroups: true,
		description: 'n8n workflow wf1',
	});
	assert.deepEqual(staticData, { subscriptionId: 'sub_1', secret: 'whsec_1' });
	assert.equal(await hooks.checkExists.call(ctx), true);

	deleteStatus = 404;
	assert.equal(await hooks.delete.call(ctx), true, 'déjà supprimé côté Wappe : pas une erreur');
	assert.deepEqual(staticData, {});
	assert.equal(await hooks.delete.call(ctx), true, 'sans abonnement : rien à faire');

	Object.assign(staticData, { subscriptionId: 'sub_1', secret: 'whsec_1' });
	deleteStatus = 500;
	await assert.rejects(() => hooks.delete.call(ctx), /Could not delete/);
});

test('trigger 2 : événements, filtres (listes par locator / id / nom), transcription', async () => {
	const staticData = {};
	const ctx = fakeContext({
		staticData,
		params: {
			events: ['message.received', 'message.sent'],
			transcribe: true,
			filters: {
				accounts: ['shop'],
				groups: 'include',
				listMode: 'all',
				lists: { list: [{ value: { __rl: true, mode: 'list', value: 'cat_client' } }, { value: { __rl: true, mode: 'name', value: 'VIP' } }, { value: '' }] },
				text: 'devis',
				textOperation: 'startsWith',
				types: ['voice'],
				sources: ['phone', 'api'],
				emojis: '👍, ❤️ 🔥',
			},
		},
		responses: { 'POST /api/webhooks/subscriptions': (o) => ({ id: 'sub_2', secret: 'whsec_2', url: o.body.url }) },
	});
	ctx.getNode = () => ({ name: 'Wappe Trigger', type: 'wappeTrigger', typeVersion: 2, parameters: {} });
	assert.equal(await new WappeTrigger().webhookMethods.default.create.call(ctx), true);
	assert.deepEqual(ctx.calls.at(-1).body, {
		url: 'https://n8n.test/webhook/abc/webhook',
		events: ['message.received', 'message.sent'],
		filters: {
			groups: 'include',
			accounts: ['shop'],
			lists: { mode: 'all', values: ['cat_client', 'VIP'] },
			text: { op: 'startsWith', value: 'devis', caseSensitive: false },
			types: ['voice'],
			sources: ['phone', 'api'],
			emojis: ['👍', '❤️', '🔥'],
		},
		transcribe: true,
		description: 'n8n workflow wf1',
	});

	const bare = fakeContext({ responses: { 'POST /api/webhooks/subscriptions': (o) => ({ id: 'sub_3', secret: 'whsec_3', url: o.body.url }) } });
	bare.getNode = () => ({ name: 'Wappe Trigger', type: 'wappeTrigger', typeVersion: 2, parameters: {} });
	await new WappeTrigger().webhookMethods.default.create.call(bare);
	assert.deepEqual(bare.calls.at(-1).body.filters, { groups: 'exclude' }, 'défauts : conversations privées, aucun autre filtre');
	assert.deepEqual(bare.calls.at(-1).body.events, ['message.received']);
});

test('trigger 2 : événements et filtres connus du spec OpenAPI de Wappe', { skip: !existsSync(API_DOCS) && 'hors monorepo' }, async () => {
	const { openApiSpec, docPublicIds } = await import(pathToFileURL(API_DOCS).href);
	const spec = openApiSpec({ ids: docPublicIds() });
	const schemas = spec.components.schemas;
	const props = new WappeTrigger().description.properties;
	const events = props.find((p) => p.name === 'events').options.map((o) => o.value).sort();
	assert.deepEqual(events, [...schemas.Subscription.properties.events.items.enum].sort(), 'mêmes événements des deux côtés');
	const filterSchema = schemas.SubscriptionFilters.properties;
	const filters = props.find((p) => p.name === 'filters').options;
	const enumOf = (name) => filters.find((p) => p.name === name).options.map((o) => o.value).sort();
	assert.deepEqual(enumOf('groups'), [...filterSchema.groups.enum].sort());
	assert.deepEqual(enumOf('listMode'), [...filterSchema.lists.properties.mode.enum].sort());
	assert.deepEqual(enumOf('textOperation'), [...filterSchema.text.properties.op.enum].sort());
	assert.deepEqual(enumOf('types'), [...filterSchema.types.items.enum].sort());
	assert.deepEqual(enumOf('sources'), [...filterSchema.sources.items.enum].sort());
});

test('trigger : checkExists oublie un abonnement disparu côté Wappe', async () => {
	const staticData = { subscriptionId: 'sub_old', secret: 's' };
	const ctx = fakeContext({ staticData, responses: { 'GET /api/webhooks/subscriptions': { subscriptions: [] } } });
	assert.equal(await new WappeTrigger().webhookMethods.default.checkExists.call(ctx), false);
	assert.deepEqual(staticData, {});
});

function webhookContext({ body, secret = 'whsec_1', signWith = secret, params = {}, responses = {} }) {
	const raw = Buffer.from(JSON.stringify(body));
	const signature = 'sha256=' + crypto.createHmac('sha256', signWith).update(raw).digest('hex');
	const ctx = fakeContext({ staticData: { subscriptionId: 'sub_1', secret }, params, responses });
	const response = { statusCode: 200, sent: null };
	ctx.getRequestObject = () => ({ body, rawBody: raw, headers: { 'x-wappe-signature': signature } });
	ctx.getResponseObject = () => ({
		status(code) { response.statusCode = code; return this; },
		json(v) { response.sent = v; return this; },
	});
	return { ctx, response };
}

const EVENT = {
	id: 'dlv_1',
	event: 'message.received',
	subscriptionId: 'sub_1',
	at: '2026-09-24T10:00:00.000Z',
	data: { session: 'shop', chatId: '33612345678@c.us', from: '33612345678', text: 'Bonjour', media: null },
};

test('trigger : un POST signé devient un item ; une signature fausse est refusée (401)', async () => {
	const trigger = new WappeTrigger();
	const ok = webhookContext({ body: EVENT });
	const res = await trigger.webhook.call(ok.ctx);
	assert.equal(res.workflowData[0].length, 1);
	const item = res.workflowData[0][0];
	assert.equal(item.json.text, 'Bonjour');
	assert.equal(item.json.from, '33612345678');
	assert.equal(item.json.event, 'message.received');
	assert.equal(item.json.deliveryId, 'dlv_1');
	assert.equal(item.binary, undefined);

	const bad = webhookContext({ body: EVENT, signWith: 'autre-secret' });
	const refused = await trigger.webhook.call(bad.ctx);
	assert.deepEqual(refused, { noWebhookResponse: true });
	assert.equal(bad.response.statusCode, 401);
});

test('trigger : un média reçu est téléchargé avec le jeton et livré en binaire', async () => {
	const body = {
		...EVENT,
		data: { ...EVENT.data, text: '', media: { kind: 'image', mimetype: 'image/jpeg', filename: 'photo.jpg', downloadPath: '/api/media/m1' } },
	};
	const { ctx } = webhookContext({ body, params: { downloadMedia: true }, responses: { 'GET /api/media/m1': Buffer.from('JPEG!') } });
	const item = (await new WappeTrigger().webhook.call(ctx)).workflowData[0][0];
	assert.equal(item.binary.data.fileName, 'photo.jpg');
	assert.equal(item.binary.data.mimeType, 'image/jpeg');
	assert.equal(Buffer.from(item.binary.data.data, 'base64').toString(), 'JPEG!');
	const dl = ctx.calls.find((c) => c.url.endsWith('/api/media/m1'));
	assert.equal(dl.credType, 'wappeApi');
	assert.equal(dl.encoding, 'arraybuffer');

	const off = webhookContext({ body, params: { downloadMedia: false } });
	const plain = (await new WappeTrigger().webhook.call(off.ctx)).workflowData[0][0];
	assert.equal(plain.binary, undefined, 'téléchargement désactivé');
	assert.equal(plain.json.media.downloadPath, '/api/media/m1');
});

test('signature : comparaison stricte', () => {
	const sig = 'sha256=' + crypto.createHmac('sha256', 'k').update('{}').digest('hex');
	assert.equal(isValidSignature('{}', sig, 'k'), true);
	assert.equal(isValidSignature('{} ', sig, 'k'), false);
	assert.equal(isValidSignature('{}', '', 'k'), false);
});

test('pièce jointe : URL ou binaire n8n posé dans le corps (media, ou audio pour un vocal)', async () => {
	const { attachMedia } = require('../dist/nodes/Wappe/binary.js');
	const ctx = (params) => ({
		getNodeParameter: (name) => params[name],
		helpers: {
			assertBinaryData: () => ({ fileName: 'facture.pdf', mimeType: 'application/pdf' }),
			getBinaryDataBuffer: async () => Buffer.from('%PDF-1.4'),
		},
	});
	const byUrl = await attachMedia.call(ctx({ operation: 'sendMedia', mediaSource: 'url', mediaUrl: 'https://x.fr/a.pdf' }), { body: { session: 's' } });
	assert.deepEqual(byUrl.body, { session: 's', media: { url: 'https://x.fr/a.pdf' } });
	const byBinary = await attachMedia.call(ctx({ operation: 'sendVoice', mediaSource: 'binary', binaryPropertyName: 'data' }), { body: {} });
	assert.deepEqual(byBinary.body.audio, { data: Buffer.from('%PDF-1.4').toString('base64'), filename: 'facture.pdf', mimetype: 'application/pdf' });
});

test('envoi en file : clé d\'idempotence stable par exécution, nœud et item ; clé fournie gardée', async () => {
	const { withIdempotencyKey } = require('../dist/nodes/Wappe/queue.js');
	const ctx = { getExecutionId: () => 'exec42', getNode: () => ({ name: 'Wappe' }), getItemIndex: () => 3 };
	const queued = await withIdempotencyKey.call(ctx, { body: { session: 's', async: true } });
	assert.equal(queued.body.idempotencyKey, 'n8n-exec42-Wappe-3');
	const again = await withIdempotencyKey.call(ctx, { body: { session: 's', async: true } });
	assert.equal(again.body.idempotencyKey, queued.body.idempotencyKey, 'un nouvel essai garde la même clé');
	const own = await withIdempotencyKey.call(ctx, { body: { async: true, idempotencyKey: 'commande-12' } });
	assert.equal(own.body.idempotencyKey, 'commande-12');
	const sync = await withIdempotencyKey.call(ctx, { body: { session: 's' } });
	assert.equal(sync.body.idempotencyKey, undefined, 'pas de clé en envoi direct');
});

test('consentement : option sur les 4 envois, jamais à true par défaut', () => {
	for (const op of ['sendText', 'sendTemplate', 'sendMedia', 'sendVoice']) {
		const o = OPS.find((x) => x.resource === 'message' && x.operation === op);
		assert.ok(o.sent.has('consent'), `${op} : consent non envoyé`);
		const consent = o.fields.find((f) => f.name === 'options').options.find((s) => s.name === 'consent');
		assert.equal(consent.default, false);
	}
	const voice = OPS.find((x) => x.operation === 'sendVoice');
	assert.ok(!voice.sent.has('replyTo'), 'la route vocale ne cite pas');
});

test('envoi refusé : message et code de Wappe, pas le texte générique de n8n', async () => {
	const { sendResult } = require('../dist/nodes/Wappe/errors.js');
	const ctx = { getNode: () => ({ name: 'Wappe', type: 'wappe', typeVersion: 1, parameters: {} }) };
	const ok = await sendResult.call(ctx, [], { statusCode: 200, headers: {}, body: { ok: true, msgId: 'm1' } });
	assert.deepEqual(ok, [{ json: { ok: true, msgId: 'm1' } }]);
	for (const [status, code] of [[400, 'consent_required'], [403, 'opted_out'], [429, 'daily_limit'], [429, 'rate_limit']]) {
		await assert.rejects(
			sendResult.call(ctx, [], { statusCode: status, headers: {}, body: { error: `refus ${code}`, code } }),
			(e) => e.message === `refus ${code}` && e.description.startsWith(`Code: ${code}.`) && e.httpCode === String(status),
		);
	}
});

test('envoi refusé par le débit : code, conseil et délai Retry-After', async () => {
	const { sendResult } = require('../dist/nodes/Wappe/errors.js');
	const ctx = { getNode: () => ({ name: 'Wappe', type: 'wappe', typeVersion: 1, parameters: {} }) };
	await assert.rejects(
		sendResult.call(ctx, [], { statusCode: 429, headers: { 'retry-after': '42' }, body: { error: 'débit', code: 'send_rate', retryAfter: 42 } }),
		(e) => e.description.includes('Queue Sending') && e.description.endsWith('Retry after 42 s'),
	);
	const queued = await sendResult.call(ctx, [], { statusCode: 202, headers: {}, body: { ok: true, jobId: 'q_1', status: 'queued' } });
	assert.equal(queued[0].json.jobId, 'q_1', 'un 202 (mise en file) est un succès');
});

test('exemples du README : chaque paramètre existe, est visible et a une valeur admise', () => {
	const { readdirSync, readFileSync } = require('node:fs');
	const types = {
		'n8n-nodes-wappe.wappe': new Wappe().description,
		'n8n-nodes-wappe.wappeTrigger': new WappeTrigger().description,
	};
	const dir = join(HERE, '..', 'examples');
	for (const file of readdirSync(dir)) {
		const workflow = JSON.parse(readFileSync(join(dir, file), 'utf8'));
		for (const node of workflow.nodes) {
			const d = types[node.type];
			assert.ok(d, `${file} : type ${node.type}`);
			assert.ok([d.version].flat().includes(node.typeVersion), `${file} : version ${node.typeVersion}`);
			const params = node.parameters;
			const shown = (p) =>
				Object.entries(p.displayOptions?.show ?? {}).every(
					([k, v]) => k === '@version' || v.includes(params[k] ?? d.properties.find((x) => x.name === k)?.default),
				);
			for (const [key, value] of Object.entries(params)) {
				const prop = d.properties.find((p) => p.name === key && shown(p));
				const where = `${file} › ${node.name} › ${key}`;
				assert.ok(prop, `${where} : paramètre inconnu ou masqué`);
				if (prop.type === 'resourceLocator') assert.ok(prop.modes.some((m) => m.name === value.mode), where);
				if (prop.type === 'options') assert.ok(prop.options.some((o) => o.value === value), where);
				if (prop.type === 'multiOptions') for (const v of value) assert.ok(prop.options.some((o) => o.value === v), where);
				if (prop.type === 'collection')
					for (const sub of Object.keys(value)) assert.ok(prop.options.some((o) => o.name === sub), `${where}.${sub}`);
			}
		}
		for (const [from, out] of Object.entries(workflow.connections)) {
			for (const name of [from, ...out.main.flat().map((c) => c.node)])
				assert.ok(workflow.nodes.some((n) => n.name === name), `${file} : connexion vers ${name}`);
		}
	}
});
