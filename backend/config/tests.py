from unittest.mock import patch

from django.db import OperationalError
from django.test import TestCase, override_settings
from django.urls import reverse


@override_settings(SECURE_SSL_REDIRECT=False)
class FoundationTests(TestCase):
    def test_health_checks_real_database(self):
        with self.assertNumQueries(1):
            response = self.client.get(reverse('health'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
        self.assertIn('no-store', response.headers['Cache-Control'])

    def test_health_returns_unavailable_without_database_details(self):
        with patch('config.views.connection.cursor', side_effect=OperationalError('private')):
            response = self.client.get(reverse('health'))
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'unavailable'})

    def test_health_rejects_writes(self):
        self.assertEqual(self.client.post(reverse('health')).status_code, 405)

    def test_admin_requires_login(self):
        self.assertRedirects(self.client.get(reverse('admin:index')),
                             '/admin/login/?next=/admin/')

    def test_admin_login_loads(self):
        response = self.client.get(reverse('admin:login'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'csrfmiddlewaretoken')
