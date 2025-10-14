#!/usr/bin/env python3
"""
Apply the database function fix
"""
import os
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()

def apply_database_fix():
    print("🔧 Applying Database Function Fix")
    print("=" * 40)
    
    # Initialize Supabase client
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not url or not key:
        print("❌ Missing environment variables")
        return
    
    client = create_client(url, key)
    print("✅ Connected to Supabase")
    
    # Read the fix SQL
    try:
        with open('fix_database_function.sql', 'r') as f:
            sql_fix = f.read()
        
        print("📄 Applying SQL fix...")
        
        # Execute the SQL fix
        result = client.rpc('exec_sql', {'sql': sql_fix}).execute()
        
        print("✅ Database function fixed successfully!")
        
        # Test the function
        print("\n🧪 Testing fixed function...")
        test_result = client.rpc('update_user_api_keys', {
            'user_uuid': '00000000-0000-0000-0000-000000000000',
            'p_alpaca_paper_key': 'test_key',
            'p_alpaca_paper_secret': 'test_secret',
            'p_alpaca_live_key': None,
            'p_alpaca_live_secret': None,
            'p_news_api_key': 'test_news_key'
        }).execute()
        
        print("✅ Function test passed!")
        print("\n🎉 Your API keys should now save successfully!")
        
    except Exception as e:
        print(f"❌ Error applying fix: {e}")
        print("\n📋 Manual Fix Instructions:")
        print("1. Go to Supabase Dashboard → SQL Editor")
        print("2. Copy the contents of fix_database_function.sql")
        print("3. Paste and run the SQL")
        print("4. Try saving API keys again")

if __name__ == '__main__':
    apply_database_fix()
