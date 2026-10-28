import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('privacy', pathlib.Path(__file__).parents[1] / 'check-git-privacy.py')
privacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(privacy)


class GitPrivacyTests(unittest.TestCase):
    def blocked(self, text):
        return [row['kind'] for row in privacy.inspect_text(text) if row['severity'] == 'block']

    def test_ip_domains_and_documentation_addresses(self):
        self.assertIn('ip-derived-domain', self.blocked('https://192-168-' + '8-8.sslip.io'))
        self.assertEqual([], self.blocked('https://203-0-113-10.sslip.io'))
        self.assertEqual([], self.blocked('https://personal.example.com'))

    def test_personal_email_and_documentation_email(self):
        personal = 'privacy-fixture' + '@' + 'qq.com'
        self.assertIn('personal-email', self.blocked(personal))
        self.assertEqual([], self.blocked('user@example.invalid'))

    def test_secret_tokens_are_reported_without_the_value(self):
        token = 'sk-' + 'a1B2' * 10
        result = privacy.inspect_text(token)
        self.assertIn('provider-key', [row['kind'] for row in result])
        self.assertNotIn(token, str(result))

    def test_generic_assignments_need_review_without_blocking_templates(self):
        result = privacy.inspect_text('password="${DATABASE_PASSWORD}"')
        self.assertTrue(any(row['severity'] == 'review' for row in result))
        self.assertFalse(self.blocked('password="${DATABASE_PASSWORD}"'))

    def test_private_key_and_basic_auth_url(self):
        self.assertIn('private-key', self.blocked('-----BEGIN ' + 'OPENSSH PRIVATE KEY-----'))
        self.assertIn('credential-in-url', self.blocked('https://user:' + 'dummy@service.example'))


if __name__ == '__main__':
    unittest.main()
