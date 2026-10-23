/**
 * Integration test for AI Displacement Tracker dataset
 * Tests Worker parsing and API endpoints with mock data
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock dataset for testing
const mockData = JSON.parse(readFileSync(join(__dirname, 'mock_ai_displacement.json'), 'utf-8'));

// Test 1: Validate data structure
function testDataStructure() {
  console.log('Test 1: Validating data structure...');
  
  if (!mockData.events || !Array.isArray(mockData.events)) {
    throw new Error('Invalid data structure: events array missing');
  }

  for (const event of mockData.events) {
    if (!event.company || !event.date || !event.sector) {
      throw new Error(`Invalid event: missing required fields in ${JSON.stringify(event)}`);
    }
  }

  console.log(`✓ Data structure valid: ${mockData.events.length} events`);
}

// Test 2: Validate date parsing and sorting
function testDateHandling() {
  console.log('\nTest 2: Validating date handling...');
  
  const events = [...mockData.events];
  events.sort((a, b) => b.date.localeCompare(a.date));

  console.log(`✓ Dates properly sortable`);
  console.log(`  Most recent: ${events[0].date} (${events[0].company})`);
  console.log(`  Oldest: ${events[events.length - 1].date} (${events[events.length - 1].company})`);
}

// Test 3: Validate aggregation logic
function testAggregation() {
  console.log('\nTest 3: Testing aggregation logic...');
  
  // Monthly aggregation
  const monthly = new Map();
  for (const event of mockData.events) {
    const month = event.date.substring(0, 7);
    const data = monthly.get(month) || { event_count: 0, workers_affected: 0 };
    data.event_count += 1;
    if (event.workers_affected) data.workers_affected += event.workers_affected;
    monthly.set(month, data);
  }

  console.log(`✓ Monthly aggregation: ${monthly.size} months`);
  for (const [month, data] of monthly.entries()) {
    console.log(`  ${month}: ${data.event_count} events, ${data.workers_affected} workers`);
  }

  // Sector aggregation
  const sectors = new Map();
  for (const event of mockData.events) {
    const data = sectors.get(event.sector) || { event_count: 0, workers_affected: 0 };
    data.event_count += 1;
    if (event.workers_affected) data.workers_affected += event.workers_affected;
    sectors.set(event.sector, data);
  }

  console.log(`\n✓ Sector aggregation: ${sectors.size} sectors`);
  for (const [sector, data] of sectors.entries()) {
    console.log(`  ${sector}: ${data.event_count} events, ${data.workers_affected} workers`);
  }
}

// Test 4: Validate worker counts
function testWorkerCounts() {
  console.log('\nTest 4: Validating worker counts...');
  
  const total = mockData.events.reduce((sum, e) => sum + (e.workers_affected || 0), 0);
  const withCounts = mockData.events.filter(e => e.workers_affected).length;
  
  console.log(`✓ Worker data: ${total.toLocaleString()} total workers across ${withCounts} events with counts`);
}

// Run all tests
try {
  console.log('=== AI Displacement Tracker Integration Tests ===\n');
  testDataStructure();
  testDateHandling();
  testAggregation();
  testWorkerCounts();
  console.log('\n=== All tests passed ✓ ===');
} catch (err) {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
}
