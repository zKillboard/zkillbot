import { parseFilters, matchesFilter } from '../src/util/filter.js';

// Mock killmail structure similar to actual zkill data
const mockKillmail = {
	package: {
		killmail: {
			killmail_id: 123456,
			solar_system_id: 30002187,
			victim: {
				character_id: 123,
				ship_type_id: 670,
				damage_taken: 5000
			},
			attackers: [
				{
					character_id: 1234,
					group_id: 26,
					damage_done: 2000,
					final_blow: false
				},
				{
					character_id: 5678,
					group_id: 26,
					damage_done: 3000,
					final_blow: true
				},
				{
					character_id: 9999,
					group_id: 27,
					damage_done: 500,
					final_blow: false
				}
			]
		},
		zkb: {
			totalValue: 5000000000,
			labels: ['loc:lowsec', 'solo']
		}
	}
};

const testCases = [
	{
		name: 'ElemMatch: Find attacker with group_id=26 AND final_blow=true',
		filter: '[group_id=26;final_blow=true]',
		expectedMatch: true,
		reason: 'Second attacker has both group_id=26 and final_blow=true'
	},
	{
		name: 'ElemMatch: Find attacker with group_id=26 AND final_blow=false',
		filter: '[group_id=26;final_blow=false]',
		expectedMatch: true,
		reason: 'First attacker has both group_id=26 and final_blow=false'
	},
	{
		name: 'ElemMatch: Find attacker with group_id=99 AND final_blow=true',
		filter: '[group_id=99;final_blow=true]',
		expectedMatch: false,
		reason: 'No attacker has group_id=99'
	},
	{
		name: 'ElemMatch: Find attacker with group_id=27 AND final_blow=true',
		filter: '[group_id=27;final_blow=true]',
		expectedMatch: false,
		reason: 'Third attacker has group_id=27 but final_blow=false'
	},
	{
		name: 'ElemMatch: Find attacker with character_id=1234 AND damage_done>1000',
		filter: '[character_id=1234;damage_done>1000]',
		expectedMatch: true,
		reason: 'First attacker has character_id=1234 and damage_done=2000'
	},
	{
		name: 'ElemMatch: Find attacker with character_id=1234 AND damage_done>5000',
		filter: '[character_id=1234;damage_done>5000]',
		expectedMatch: false,
		reason: 'First attacker has character_id=1234 but damage_done=2000 (not > 5000)'
	},
	{
		name: 'ElemMatch with OR inside: Find attacker with (character_id=1234 OR character_id=5678) AND final_blow=true',
		filter: '[(character_id=1234,character_id=5678);final_blow=true]',
		expectedMatch: true,
		reason: 'Second attacker has character_id=5678 and final_blow=true'
	},
	{
		name: 'Combined: totalValue>1B AND elemMatch',
		filter: 'totalValue>1000000000;[group_id=26;final_blow=true]',
		expectedMatch: true,
		reason: 'Both conditions are met'
	},
	{
		name: 'Combined: totalValue>10B AND elemMatch',
		filter: 'totalValue>10000000000;[group_id=26;final_blow=true]',
		expectedMatch: false,
		reason: 'totalValue is only 5B'
	},
	{
		name: 'Regular filter (not elemMatch): group_id=26 (should match if ANY has group_id=26)',
		filter: 'group_id=26',
		expectedMatch: true,
		reason: 'First and second attackers have group_id=26'
	},
	{
		name: 'Regular filter vs ElemMatch: group_id=26 AND final_blow=true (without [])',
		filter: 'group_id=26;final_blow=true',
		expectedMatch: true,
		reason: 'Without [], it checks if ANY attacker has group_id=26 AND ANY has final_blow=true (can be different attackers)'
	}
];

console.log('Testing ElemMatch Functionality\n' + '='.repeat(70));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
	try {
		const filter = parseFilters(testCase.filter);
		const result = matchesFilter(mockKillmail, filter);
		
		if (result === testCase.expectedMatch) {
			console.log(`✅ PASS: ${testCase.name}`);
			console.log(`   Filter: ${testCase.filter}`);
			console.log(`   Expected: ${testCase.expectedMatch ? 'MATCH' : 'NO MATCH'}`);
			console.log(`   Result: ${result ? 'MATCH' : 'NO MATCH'}`);
			console.log(`   Reason: ${testCase.reason}`);
			passed++;
		} else {
			console.log(`❌ FAIL: ${testCase.name}`);
			console.log(`   Filter: ${testCase.filter}`);
			console.log(`   Expected: ${testCase.expectedMatch ? 'MATCH' : 'NO MATCH'}`);
			console.log(`   Result: ${result ? 'MATCH' : 'NO MATCH'}`);
			console.log(`   Reason: ${testCase.reason}`);
			console.log(`   Parsed filter:`, JSON.stringify(filter, null, 2));
			failed++;
		}
	} catch (err) {
		console.log(`❌ ERROR: ${testCase.name}`);
		console.log(`   Filter: ${testCase.filter}`);
		console.log(`   Error: ${err.message}`);
		failed++;
	}
	console.log('');
}

console.log('='.repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
	console.log('🎉 All tests passed!');
	process.exit(0);
} else {
	console.log('❌ Some tests failed');
	process.exit(1);
}
