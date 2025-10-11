/**
 * Test script for Market Data Aggregator
 */

const http = require('http');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = http.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testHealth() {
  console.log('\n🏥 Testing health endpoint...');
  const res = await request('/health');
  console.log(`  Status: ${res.status}`);
  console.log(`  Response:`, JSON.stringify(res.data, null, 2));
  return res.status === 200;
}

async function testSubscribe() {
  console.log('\n📊 Testing subscribe endpoint...');
  const res = await request('/subscribe', 'POST', {
    symbols: ['AAPL', 'TSLA', 'NVDA']
  });
  console.log(`  Status: ${res.status}`);
  console.log(`  Response:`, JSON.stringify(res.data, null, 2));
  return res.status === 200;
}

async function testQuote() {
  console.log('\n💰 Testing quote endpoint...');
  
  // Wait a bit for data to arrive
  console.log('  Waiting 3 seconds for data...');
  await sleep(3000);
  
  const res = await request('/quote/AAPL');
  console.log(`  Status: ${res.status}`);
  console.log(`  Response:`, JSON.stringify(res.data, null, 2));
  return res.status === 200;
}

async function testQuotes() {
  console.log('\n💰 Testing batch quotes endpoint...');
  const res = await request('/quotes', 'POST', {
    symbols: ['AAPL', 'TSLA', 'NVDA']
  });
  console.log(`  Status: ${res.status}`);
  console.log(`  Response:`, JSON.stringify(res.data, null, 2));
  return res.status === 200;
}

async function testSymbols() {
  console.log('\n📋 Testing symbols endpoint...');
  const res = await request('/symbols');
  console.log(`  Status: ${res.status}`);
  console.log(`  Response:`, JSON.stringify(res.data, null, 2));
  return res.status === 200;
}

async function testStats() {
  console.log('\n📊 Testing stats endpoint...');
  const res = await request('/stats');
  console.log(`  Status: ${res.status}`);
  console.log(`  Response:`, JSON.stringify(res.data, null, 2));
  return res.status === 200;
}

async function main() {
  console.log('='.repeat(70));
  console.log('🧪 MARKET DATA AGGREGATOR TEST');
  console.log('='.repeat(70));
  console.log(`Testing: ${BASE_URL}`);
  
  const results = {};
  
  try {
    results.health = await testHealth();
    results.subscribe = await testSubscribe();
    results.quote = await testQuote();
    results.quotes = await testQuotes();
    results.symbols = await testSymbols();
    results.stats = await testStats();
  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  
  for (const [test, passed] of Object.entries(results)) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${test}: ${status}`);
  }
  
  const allPassed = Object.values(results).every(v => v);
  
  console.log('\n' + '='.repeat(70));
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED!');
  } else {
    console.log('❌ SOME TESTS FAILED');
  }
  console.log('='.repeat(70));
  
  process.exit(allPassed ? 0 : 1);
}

main();

