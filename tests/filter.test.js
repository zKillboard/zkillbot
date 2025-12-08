import { parseFilters } from '../src/util/filter.js';

const testCases = [
	// New elemMatch test case
	{
		name: 'ElemMatch: group_id and final_blow in same attacker',
		filter: '[group_id=26;final_blow=true]',
		shouldParse: true
	},
	// Existing filters from database
	{
		name: 'Multiple character IDs with nested conditions',
		filter: '(character_id=2114686815),(character_id=2121599379;(labels=solo,iskvalue>=1000000000)),(character_id=2123587391)',
		shouldParse: true
	},
	{
		name: 'Group IDs in nullsec',
		filter: '(group_id=1813,group_id=1814,group_id=1803);labels=loc:nullsec',
		shouldParse: true
	},
	{
		name: 'Multiple ship types in highsec above ISK threshold',
		filter: '(ship_type_id=20183, ship_type_id=20185, ship_type_id=20187, ship_type_id=20189, ship_type_id=28844, ship_type_id=28846, ship_type_id=28848, ship_type_id=28850, ship_type_id=81040);labels=loc:highsec;totalValue>1000000000',
		shouldParse: true
	},
	{
		name: 'Lowsec with ISK threshold and location filter',
		filter: 'labels=loc:lowsec;totalValue>50000000;(loc=10000069,loc=10000048,loc=10000033)',
		shouldParse: true
	},
	{
		name: 'Simple w-space label',
		filter: 'labels=loc:w-space',
		shouldParse: true
	},
	{
		name: 'NPC kills with ISK threshold in highsec or lowsec',
		filter: 'totalValue>250000000;npc=true;(labels=loc:highsec,labels=loc:lowsec)',
		shouldParse: true
	},
	// Additional test cases
	{
		name: 'ElemMatch with multiple conditions',
		filter: '[character_id=1234;damage_done>1000;final_blow=true]',
		shouldParse: true
	},
	{
		name: 'ElemMatch combined with other filters',
		filter: 'totalValue>1000000000;[character_id=1234;final_blow=true]',
		shouldParse: true
	},
	{
		name: 'Complex nested with elemMatch',
		filter: '([character_id=1234;final_blow=true],totalValue>5000000000);labels=loc:lowsec',
		shouldParse: true
	}
];

console.log('Testing Filter Parser\n' + '='.repeat(50));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
	try {
		const result = parseFilters(testCase.filter);
		if (testCase.shouldParse) {
			console.log(`✅ PASS: ${testCase.name}`);
			console.log(`   Filter: ${testCase.filter}`);
			console.log(`   Parsed:`, JSON.stringify(result, null, 2));
			passed++;
		} else {
			console.log(`❌ FAIL: ${testCase.name}`);
			console.log(`   Expected to fail but parsed successfully`);
			console.log(`   Filter: ${testCase.filter}`);
			failed++;
		}
	} catch (err) {
		if (!testCase.shouldParse) {
			console.log(`✅ PASS: ${testCase.name}`);
			console.log(`   Expected error: ${err.message}`);
			passed++;
		} else {
			console.log(`❌ FAIL: ${testCase.name}`);
			console.log(`   Filter: ${testCase.filter}`);
			console.log(`   Error: ${err.message}`);
			failed++;
		}
	}
	console.log('');
}

console.log('='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
	console.log('🎉 All tests passed!');
	process.exit(0);
} else {
	console.log('❌ Some tests failed');
	process.exit(1);
}
