#!/usr/bin/env python3
"""
Test script to debug API keys saving issue
"""
import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()

def test_database_functions():
    print("🔍 Testing Supabase Database Functions")
    print("=" * 50)
    
    # Initialize Supabase client
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not url or not key:
        print("❌ Missing environment variables")
        return
    
    client = create_client(url, key)
    print("✅ Connected to Supabase")
    
    # Test 1: Check if user_settings table exists
    print("\n📊 Testing database structure...")
    try:
        result = client.table('user_settings').select('*').limit(1).execute()
        print("✅ user_settings table exists")
    except Exception as e:
        print(f"❌ user_settings table error: {e}")
        return
    
    # Test 2: Check if update_user_api_keys function exists
    print("\n🔧 Testing database functions...")
    try:
        # Try to call the function with test data
        result = client.rpc('update_user_api_keys', {
            'user_uuid': '00000000-0000-0000-0000-000000000000',  # Test UUID
            'alpaca_paper_key': 'test_key',
            'alpaca_paper_secret': 'test_secret',
            'alpaca_live_key': None,
            'alpaca_live_secret': None,
            'news_api_key': 'test_news_key'
        }).execute()
        print("✅ update_user_api_keys function exists")
    except Exception as e:
        print(f"❌ update_user_api_keys function error: {e}")
        print("   This is likely why API keys saving fails!")
        return
    
    # Test 3: Check if get_user_api_keys function exists
    try:
        result = client.rpc('get_user_api_keys', {
            'user_uuid': '00000000-0000-0000-0000-000000000000'
        }).execute()
        print("✅ get_user_api_keys function exists")
    except Exception as e:
        print(f"❌ get_user_api_keys function error: {e}")
    
    print("\n🎯 Recommendation:")
    print("If functions don't exist, you need to run the database migrations.")
    print("Go to Supabase Dashboard → SQL Editor → Run apply-migrations.sql")

if __name__ == '__main__':
    test_database_functions()
