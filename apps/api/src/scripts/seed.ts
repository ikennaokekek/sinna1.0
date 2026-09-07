import crypto from 'crypto';
import { seedTenantAndApiKey } from '../lib/db';

async function main() {
	// Use environment-specific tenant email based on NODE_ENV
	const isDev = process.env.NODE_ENV !== 'production';
	const tenantEmail = isDev ? 'ikennaokeke1996@gmail.com' : 'motion24inc@gmail.com';
	const tenantName = process.env.TENANT_NAME || tenantEmail;
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

	console.log('Seeding tenant and API key...');
	console.log(`Environment: ${isDev ? 'development' : 'production'}`);
	console.log(`Tenant email: ${tenantEmail}`);
	console.log(`Tenant name: ${tenantName}`);
	
	try {
		const res = await seedTenantAndApiKey({ tenantName, plan, apiKeyHash });
		console.log('✅ Seed complete:', { 
			tenantId: res.tenantId, 
			tenantName,
			plan, 
			apiKeyHash: apiKeyHash.substring(0, 16) + '...' 
		});
		console.log('🔑 Store this API key securely (not in code):', apiKey);
	} catch (error: any) {
		console.error('❌ Seed failed:', error.message);
		if (error.code) {
			console.error(`   Database error code: ${error.code}`);
		}
		throw error;
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
