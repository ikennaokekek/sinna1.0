import crypto from 'crypto';
import { runMigrations, seedTenantAndApiKey } from '../lib/db';

async function main() {
	const tenantName = process.env.TENANT_NAME || 'Default Org';
	const plan = process.env.PLAN || 'standard';
	const apiKey = process.env.API_KEY;
	if (!process.env.DATABASE_URL) {
		console.error('DATABASE_URL is required');
		process.exit(1);
	}
	if (!apiKey) {
		console.error('API_KEY env var is required (the plaintext key to hash)');
		process.exit(1);
	}
	const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

	console.log('Running migrations...');
	await runMigrations();

	console.log('Seeding tenant and API key...');
	const res = await seedTenantAndApiKey({ tenantName, plan, apiKeyHash });
	console.log('Seed complete:', { tenantId: res.tenantId, plan, apiKeyHash });
	console.log('Store this API key securely (not in code):', apiKey);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
