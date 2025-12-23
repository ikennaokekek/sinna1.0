#!/usr/bin/env python3
import requests
import json
import sys
import os

stripe_key = os.environ.get('STRIPE_SECRET_KEY')
price_id = os.environ.get('STRIPE_STANDARD_PRICE_ID', 'price_1SLDYEFOUj5aKuFKieTbbTX1')
base_url = os.environ.get('BASE_URL_PUBLIC', 'https://sinna.site')

if not stripe_key:
    print('❌ Error: STRIPE_SECRET_KEY environment variable is required')
    print('\n💡 Set it:')
    print('   export STRIPE_SECRET_KEY="sk_live_..."')
    print('   export STRIPE_STANDARD_PRICE_ID="price_..."')
    print('\nOr get from Render:')
    print('   https://dashboard.render.com/web/srv-d3hv3lhgv73c73e16jcg → Environment')
    sys.exit(1)

response = requests.post(
    'https://api.stripe.com/v1/checkout/sessions',
    auth=(stripe_key, ''),
    data={
        'mode': 'subscription',
        'line_items[0][price]': price_id,
        'line_items[0][quantity]': '1',
        'success_url': f'{base_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}',
        'cancel_url': f'{base_url}/billing/cancel',
        'payment_method_types[0]': 'card',
        'allow_promotion_codes': 'true',
        'billing_address_collection': 'required',
    }
)

data = response.json()

if response.status_code == 200 and 'url' in data:
    print('\n' + '=' * 70)
    print('✅ CHECKOUT LINK CREATED!')
    print('=' * 70)
    print('\n' + data['url'] + '\n')
    print('=' * 70)
    print(f'\n📋 Session ID: {data["id"]}')
    print('💳 Share this link with clients to subscribe!\n')
else:
    print('❌ Error creating checkout session:')
    print(json.dumps(data, indent=2))
    sys.exit(1)

