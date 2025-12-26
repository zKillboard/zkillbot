import { parseFilters, matchesFilter } from '../src/util/filter.js';

// Test edge cases with elemMatch parsing

const parseTestCases = [
	{
		name: 'Simple elemMatch with two conditions',
		filter: '[group_id=26;final_blow=true]',
		description: 'Should create ELEMMATCH with AND group inside'
	},
	{
		name: 'elemMatch with single condition',
		filter: '[group_id=26]',
		description: 'Should create ELEMMATCH with single rule'
	},
	{
		name: 'elemMatch with OR inside',
		filter: '[character_id=1234,character_id=5678]',
		description: 'Should create ELEMMATCH with OR group inside'
	},
	{
		name: 'elemMatch with complex nested logic',
		filter: '[(character_id=1234,character_id=5678);final_blow=true]',
		description: 'Should create ELEMMATCH with AND containing OR'
	},
	{
		name: 'Multiple elemMatch with OR',
		filter: '[group_id=26;final_blow=true],[group_id=27;final_blow=true]',
		description: 'Two different elemMatch conditions with OR between them'
	},
	{
		name: 'Multiple elemMatch with AND',
		filter: '[group_id=26];[final_blow=true]',
		description: 'Two elemMatch conditions that must both be satisfied (but can be different array elements)'
	}
];

console.log('Testing ElemMatch Edge Cases\n' + '='.repeat(70));

for (const testCase of parseTestCases) {
	console.log(`\n📋 ${testCase.name}`);
	console.log(`   Filter: ${testCase.filter}`);
	console.log(`   ${testCase.description}`);
	
	try {
		const parsed = parseFilters(testCase.filter);
		console.log(`   ✅ Parsed successfully`);
		console.log(`   Structure: ${JSON.stringify(parsed, null, 2).split('\n').map((l, i) => i === 0 ? l : '              ' + l).join('\n')}`);
	} catch (err) {
		console.log(`   ❌ Parse error: ${err.message}`);
	}
}

// Now test matching behavior with the data
const mockKillmail = {
	package: {
		killmail: {
			attackers: [
				{
					character_id: 1234,
					group_id: 26,
					final_blow: false
				},
				{
					character_id: 5678,
					group_id: 27,
					final_blow: true
				}
			]
		}
	}
};

console.log('\n\n' + '='.repeat(70));
console.log('Testing Matching Behavior\n');

const matchTestCases = [
	{
		name: 'Single elemMatch should match',
		filter: '[group_id=26]',
		expectedMatch: true
	},
	{
		name: 'Two elemMatch with OR - at least one matches',
		filter: '[group_id=26;final_blow=true],[group_id=27;final_blow=true]',
		expectedMatch: true,
		reason: 'Second attacker matches second elemMatch'
	},
	{
		name: 'Two elemMatch with AND - both must have matching elements',
		filter: '[group_id=26];[final_blow=true]',
		expectedMatch: true,
		reason: 'First attacker has group_id=26, second has final_blow=true (different elements OK)'
	},
	{
		name: 'Two elemMatch with AND - second has no match',
		filter: '[group_id=26];[group_id=99]',
		expectedMatch: false,
		reason: 'No attacker has group_id=99'
	}
];

for (const testCase of matchTestCases) {
	try {
		const filter = parseFilters(testCase.filter);
		const result = matchesFilter(mockKillmail, filter);
		
		const status = result === testCase.expectedMatch ? '✅ PASS' : '❌ FAIL';
		console.log(`\n${status}: ${testCase.name}`);
		console.log(`   Filter: ${testCase.filter}`);
		console.log(`   Expected: ${testCase.expectedMatch ? 'MATCH' : 'NO MATCH'}`);
		console.log(`   Result: ${result ? 'MATCH' : 'NO MATCH'}`);
		if (testCase.reason) {
			console.log(`   Reason: ${testCase.reason}`);
		}
		
		if (result !== testCase.expectedMatch) {
			console.log(`   Parsed filter:`, JSON.stringify(filter, null, 2));
		}
	} catch (err) {
		console.log(`\n❌ ERROR: ${testCase.name}`);
		console.log(`   Error: ${err.message}`);
	}
}
