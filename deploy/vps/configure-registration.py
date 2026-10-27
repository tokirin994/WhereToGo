"""Merge registration settings into an existing realm; preserve users and custom fields."""
from __future__ import print_function
import json, sys

profile = json.load(open(sys.argv[1]))
for attribute in profile['attributes']:
    name = attribute['name']
    if name in ('firstName', 'lastName'):
        attribute.pop('required', None)
    if name == 'username':
        attribute.setdefault('validations', {})['length'] = {'min': 3, 'max': 64}
        attribute.setdefault('annotations', {})['inputHelperTextAfter'] = '${personalUsernameHint}'
    if name == 'email':
        attribute['required'] = {'roles': ['user']}
        attribute.setdefault('annotations', {})['inputHelperTextAfter'] = '${personalEmailHint}'
json.dump(profile, open(sys.argv[2], 'w'))
