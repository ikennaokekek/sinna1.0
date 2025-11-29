#!/usr/bin/env python3
import requests
import json
import sys

stripe_key = 'sk_live_[REDACTED]'
price_id = 'price_1SLDYEFOUj5aKuFKieTbbTX1'
base_url = 'https://sinna.site'

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

