#!/usr/bin/env node
/**
 * Environment Setup Checker
 * Run this to verify your .env.local file is configured correctly
 */

const fs = require('fs');
const path = require('path');

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const optional = [
  'NEWS_API_KEY',
  'ALPACA_PAPER_KEY',
  'ALPACA_PAPER_SECRET',
  'ALPACA_LIVE_KEY',
  'ALPACA_LIVE_SECRET'
];

console.log('\n🔍 Checking Environment Configuration...\n');

// Check if .env.local exists
const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local file not found!');
  console.log('\n📝 To fix this:');
  console.log('1. Copy .env.local.example to .env.local');
  console.log('2. Fill in your Supabase credentials from https://supabase.com');
  console.log('\nRun: cp .env.local.example .env.local\n');
  process.exit(1);
}

// Load environment variables from .env.local
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    env[key] = value;
  }
});

let hasErrors = false;
let hasWarnings = false;

// Check required variables
console.log('✅ Required Variables:');
required.forEach(key => {
  const value = env[key];
  if (!value || value.includes('your-') || value.includes('here')) {
    console.log(`   ❌ ${key}: NOT SET or using placeholder`);
    hasErrors = true;
  } else {
    const preview = value.substring(0, 20) + '...';
    console.log(`   ✓ ${key}: ${preview}`);
  }
});

// Check optional variables
console.log('\n⚠️  Optional Variables (recommended):');
optional.forEach(key => {
  const value = env[key];
  if (!value || value.includes('your-') || value.includes('here')) {
    console.log(`   ⚠  ${key}: not set (you can add later)`);
    hasWarnings = true;
  } else {
    console.log(`   ✓ ${key}: configured`);
  }
});

console.log('\n' + '='.repeat(60));

if (hasErrors) {
  console.log('\n❌ SETUP INCOMPLETE');
  console.log('\n📖 Next steps:');
  console.log('1. Go to https://supabase.com');
  console.log('2. Create a new project (free tier available)');
  console.log('3. Go to Project Settings → API');
  console.log('4. Copy URL and keys to your .env.local file');
  console.log('5. Run this script again to verify\n');
  process.exit(1);
} else {
  console.log('\n✅ ALL REQUIRED VARIABLES SET!');
  
  if (hasWarnings) {
    console.log('\n💡 Optional: Add NEWS_API_KEY for sentiment analysis');
    console.log('   Get free key from https://newsapi.org/register\n');
  }
  
  console.log('\n🚀 You can now run: npm run dev\n');
  process.exit(0);
}

