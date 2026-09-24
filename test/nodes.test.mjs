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
const { searchAccounts, searchGroups, searchTemplates, searchContacts, searchStages } = require('../dist/nodes/Wappe/listSearch.js');

const API_DOCS = join(HERE, '..', '..', '..', 'app', 'src', 'api-docs.js');

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
		assert.ok(o.option.routing.request.url.startsWith('/api/'), `${o.operation} : url relative`);
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
		const { method, url } = o.option.routing.request;
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
