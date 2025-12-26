import { parseFilters, matchesFilter } from '../src/util/filter.js';

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
	console.error('Usage: node tests/killmail.js <killmail-url> "<filter>"');
	console.error('Example: node tests/killmail.js "https://esi.evetech.net/latest/killmails/131960277/dc00d90e37bfe2332e60d13bd43180348776b267/" "totalValue>1000000000"');
	process.exit(1);
}

const killmailUrl = args[0];
const filterString = args[1];

console.log('='.repeat(60));
console.log('Killmail Filter Tester');
console.log('='.repeat(60));
console.log(`URL: ${killmailUrl}`);
console.log(`Filter: ${filterString}`);
console.log('='.repeat(60));

async function testKillmail() {
	try {
		// Parse the filter
		console.log('\n📋 Parsing filter...');
		const filter = parseFilters(filterString);
		console.log('✅ Filter parsed successfully');
		//console.log(JSON.stringify(filter, null, 2));
		
		// Fetch killmail from ESI
		console.log('\n🌐 Fetching killmail from ESI...');
		const response = await fetch(killmailUrl);
		
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		
		const killmail = await response.json();
		console.log('✅ Killmail fetched successfully');
		console.log(`   Victim: ${killmail.victim.character_id || 'NPC'} in ${killmail.victim.ship_type_id}`);
		console.log(`   System: ${killmail.solar_system_id}`);
		console.log(`   Attackers: ${killmail.attackers.length}`);
		
		// Add is_victim flag (like the bot does)
		for (const attacker of killmail.attackers) {
			attacker.is_victim = false;
		}
		killmail.victim.is_victim = true;
		
		// Fetch zKillboard data for additional info
		const killmailId = killmailUrl.match(/\/killmails\/(\d+)\//)?.[1];
		if (killmailId) {
			console.log('\n🔍 Fetching zKillboard data...');
			const zkbResponse = await fetch(`https://zkillboard.com/api/killID/${killmailId}/`);
			if (zkbResponse.ok) {
				const zkbData = await zkbResponse.json();
				if (zkbData && zkbData[0]) {
					const zkb = zkbData[0].zkb;
					console.log('✅ zKillboard data fetched');
					console.log(`   Total Value: ${zkb.totalValue?.toLocaleString()} ISK`);
					console.log(`   Points: ${zkb.points}`);
					console.log(`   Labels: ${zkb.labels?.join(', ') || 'none'}`);
					
					// Create package structure similar to RedisQ
					const pkg = {
						package: {
							killmail: killmail,
							zkb: zkb
						}
					};
					
					// Test the filter
					console.log('\n🧪 Testing filter match...');
					const matches = matchesFilter(pkg, filter);
					
					console.log('\n' + '='.repeat(60));
					if (matches) {
						console.log('✅ MATCH: Killmail matches the filter!');
					} else {
						console.log('❌ NO MATCH: Killmail does not match the filter');
					}
					console.log('='.repeat(60));
					
					// Show detailed package structure for debugging
					if (!matches) {
						console.log('\n📦 Package structure (for debugging):');
						console.log(JSON.stringify(pkg, null, 2));
					}
					
					process.exit(matches ? 0 : 1);
				}
			}
		}

		// If we couldn't get zkb data, just test with the killmail
		console.log('\n⚠️  Could not fetch zKillboard data, testing with killmail only...');
		const pkg = {
			package: {
				killmail: killmail,
				zkb: {}
			}
		};
		
		const matches = matchesFilter(pkg, filter);
		
		console.log('\n' + '='.repeat(60));
		if (matches) {
			console.log('✅ MATCH: Killmail matches the filter!');
		} else {
			console.log('❌ NO MATCH: Killmail does not match the filter');
		}
		console.log('='.repeat(60));
		
		process.exit(matches ? 0 : 1);
		
	} catch (err) {
		console.error('\n❌ Error:', err.message);
		console.error(err.stack);
		process.exit(1);
	}
}

testKillmail();
