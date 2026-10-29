from io import StringIO
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from compensation.models import SalaryRecord
from employees.models import Department, Employee


@override_settings(SECURE_SSL_REDIRECT=False)
class AuthenticationTests(APITestCase):
    password = 'TestOnly-Complex-Password-47!'

    @classmethod
    def setUpTestData(cls):
        users = get_user_model()
        cls.hr = users.objects.create_user(username='auth-hr', email='hr@example.com',
                                           password=cls.password, is_staff=True)
        cls.nonstaff = users.objects.create_user(username='auth-nonstaff', password=cls.password)
        cls.inactive = users.objects.create_user(username='auth-inactive', password=cls.password,
                                                 is_staff=True, is_active=False)
        department = Department.objects.create(name='Engineering')
        cls.employee = Employee.objects.create(
            employee_code='AUTH-EMP', full_name='Example Employee', email='employee@example.com',
            department=department, country='IN', job_title='Engineer')
        SalaryRecord.objects.create(employee=cls.employee, annual_salary='1000000.00', currency='INR',
                                    effective_from='2020-01-01')

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)

    def csrf(self):
        response = self.client.get(reverse('csrf-token'))
        self.assertEqual(response.status_code, 200)
        return response.data['csrfToken']

    def login(self, username='auth-hr', **kwargs):
        return self.client.post(reverse('login'), {'username': username, 'password': self.password},
                                format='json', HTTP_X_CSRFTOKEN=self.csrf(), **kwargs)

    def business_gets(self):
        return [reverse('employee-list'), reverse('employee-detail', args=[self.employee.pk]),
                reverse('department-list'), reverse('employee-salaries', args=[self.employee.pk]),
                reverse('analytics-overview') + '?country=IN',
                reverse('analytics-departments') + '?country=IN',
                reverse('analytics-distribution') + '?country=IN']

    def test_anonymous_bootstrap_sets_csrf_cookie_and_disables_caching(self):
        response = self.client.get(reverse('csrf-token'))
        self.assertEqual(response.status_code, 200)
        self.assertIn('csrfToken', response.data)
        self.assertIn('csrftoken', response.cookies)
        self.assertIn('no-store', response['Cache-Control'])
        self.assertNotIn(settings.SESSION_COOKIE_NAME, response.cookies)

    def test_login_requires_csrf_even_without_a_session(self):
        response = self.client.post(reverse('login'), {
            'username': self.hr.username, 'password': self.password}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertNotIn('_auth_user_id', self.client.session)
        self.csrf()
        self.assertEqual(self.client.post(reverse('login'), {
            'username': self.hr.username, 'password': self.password}, format='json').status_code, 403)

    def test_login_sets_session_rotates_csrf_and_exposes_only_safe_identity(self):
        old_token = self.csrf()
        old_cookie = self.client.cookies['csrftoken'].value
        response = self.client.post(reverse('login'), {'username': self.hr.username, 'password': self.password},
                                    format='json', HTTP_X_CSRFTOKEN=old_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['user'], {
            'id': self.hr.pk, 'username': 'auth-hr', 'email': 'hr@example.com', 'is_staff': True})
        self.assertNotEqual(self.client.cookies['csrftoken'].value, old_cookie)
        self.assertNotEqual(response.data['csrfToken'], old_token)
        self.assertEqual(self.client.session['_auth_user_id'], str(self.hr.pk))
        self.assertNotIn('password', str(response.data))
        self.assertIn('no-store', response['Cache-Control'])
        self.assertTrue(response.cookies[settings.SESSION_COOKIE_NAME]['httponly'])
        self.assertEqual(response.cookies[settings.SESSION_COOKIE_NAME]['samesite'], 'Lax')

    def test_login_prevents_session_fixation(self):
        session = self.client.session
        session['probe'] = 'existing anonymous session'
        session.save()
        original = session.session_key
        self.assertEqual(self.login().status_code, 200)
        self.assertNotEqual(self.client.session.session_key, original)
        self.assertFalse(Session.objects.filter(session_key=original).exists())

    def test_invalid_inactive_and_nonstaff_logins_share_generic_error(self):
        expected = None
        for username in ['missing', 'auth-nonstaff', 'auth-inactive']:
            with self.subTest(username=username):
                response = self.login(username)
                self.assertEqual(response.status_code, 403)
                expected = expected or response.data
                self.assertEqual(response.data, expected)
                self.assertNotIn('_auth_user_id', self.client.session)
        response = self.client.post(reverse('login'), {'username': self.hr.username, 'password': 'wrong'},
                                    format='json', HTTP_X_CSRFTOKEN=self.csrf())
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data, expected)

    def test_invalid_login_payload_returns_validation_errors(self):
        for payload, key in [({}, 'username'), ({'username': 'auth-hr'}, 'password'),
                             ({'username': '', 'password': self.password}, 'username')]:
            with self.subTest(payload=payload):
                response = self.client.post(reverse('login'), payload, format='json',
                                            HTTP_X_CSRFTOKEN=self.csrf())
                self.assertEqual(response.status_code, 400)
                self.assertIn(key, response.data)

    def test_me_requires_hr_and_does_not_cache_identity(self):
        self.assertEqual(self.client.get(reverse('me')).status_code, 403)
        self.assertEqual(self.login().status_code, 200)
        response = self.client.get(reverse('me'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'auth-hr')
        self.assertNotIn('password', response.data)
        self.assertIn('no-store', response['Cache-Control'])

    def test_real_login_session_can_access_every_business_get(self):
        self.assertEqual(self.login().status_code, 200)
        for path in self.business_gets():
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 200)

    def test_unauthenticated_and_nonstaff_sessions_cannot_access_business_gets(self):
        for user in [None, self.nonstaff]:
            if user:
                self.client.force_login(user)
            for path in self.business_gets() + [reverse('me')]:
                with self.subTest(user=user, path=path):
                    self.assertEqual(self.client.get(path).status_code, 403)

    def test_staff_revocation_and_deactivation_take_effect_on_next_request(self):
        self.assertEqual(self.login().status_code, 200)
        self.hr.is_staff = False
        self.hr.save()
        self.assertEqual(self.client.get(reverse('me')).status_code, 403)
        self.assertEqual(self.client.get(reverse('employee-list')).status_code, 403)
        self.hr.is_staff = True
        self.hr.is_active = False
        self.hr.save()
        self.assertEqual(self.client.get(reverse('me')).status_code, 403)

    def test_business_writes_require_current_csrf_token(self):
        token = self.login().data['csrfToken']
        detail = reverse('employee-detail', args=[self.employee.pk])
        self.assertEqual(self.client.patch(detail, {'is_active': False}, format='json').status_code, 403)
        response = self.client.patch(detail, {'is_active': False}, format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['is_active'])

    def test_logout_requires_csrf_and_invalidates_server_session(self):
        login_response = self.login()
        token = login_response.data['csrfToken']
        session_key = self.client.session.session_key
        self.assertEqual(self.client.post(reverse('logout')).status_code, 403)
        self.assertEqual(self.client.get(reverse('me')).status_code, 200)
        response = self.client.post(reverse('logout'), HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b'')
        self.assertIn('no-store', response['Cache-Control'])
        self.assertFalse(Session.objects.filter(session_key=session_key).exists())
        self.assertEqual(self.client.get(reverse('me')).status_code, 403)
        self.assertEqual(self.client.get(reverse('employee-list')).status_code, 403)

    def test_prelogin_token_is_not_valid_after_login_rotation(self):
        old_token = self.csrf()
        response = self.client.post(reverse('login'), {'username': self.hr.username, 'password': self.password},
                                    format='json', HTTP_X_CSRFTOKEN=old_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.post(reverse('logout'), HTTP_X_CSRFTOKEN=old_token).status_code, 403)
        self.assertEqual(self.client.post(reverse('logout'),
                         HTTP_X_CSRFTOKEN=response.data['csrfToken']).status_code, 204)

    def test_swagger_cookie_token_supports_login_and_logout_after_rotation(self):
        response = self.client.get(reverse('swagger-ui'), HTTP_ACCEPT='text/html')
        self.assertEqual(response.status_code, 200)
        initial_cookie = self.client.cookies['csrftoken'].value
        response = self.client.post(reverse('login'), {'username': self.hr.username, 'password': self.password},
                                    format='json', HTTP_X_CSRFTOKEN=initial_cookie)
        self.assertEqual(response.status_code, 200)
        current_cookie = self.client.cookies['csrftoken'].value
        self.assertNotEqual(current_cookie, initial_cookie)
        self.assertEqual(self.client.post(reverse('logout'), HTTP_X_CSRFTOKEN=current_cookie).status_code, 204)

    def test_schema_does_not_add_manual_csrf_headers_to_swagger_auth_forms(self):
        response = self.client.get(reverse('schema'), HTTP_ACCEPT='application/vnd.oai.openapi+json')
        self.assertEqual(response.status_code, 200)
        for path in ['/api/login/', '/api/logout/']:
            parameters = response.data['paths'][path]['post'].get('parameters', [])
            self.assertFalse(any(parameter['in'] == 'header' and
                                 parameter['name'].lower() == 'x-csrftoken' for parameter in parameters))

    def test_foreign_origin_is_rejected_even_with_valid_token(self):
        response = self.client.post(reverse('login'), {'username': self.hr.username, 'password': self.password},
                                    format='json', HTTP_X_CSRFTOKEN=self.csrf(), HTTP_ORIGIN='https://foreign.example')
        self.assertEqual(response.status_code, 403)
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_password_whitespace_is_preserved(self):
        self.hr.set_password('  spaced-test-password!  ')
        self.hr.save()
        response = self.client.post(reverse('login'), {
            'username': self.hr.username, 'password': '  spaced-test-password!  '},
            format='json', HTTP_X_CSRFTOKEN=self.csrf())
        self.assertEqual(response.status_code, 200)

    def test_nonstaff_can_only_logout_its_existing_session(self):
        self.client.force_login(self.nonstaff)
        token = self.csrf()
        self.assertEqual(self.client.get(reverse('me')).status_code, 403)
        self.assertEqual(self.client.post(reverse('logout'), HTTP_X_CSRFTOKEN=token).status_code, 204)

    def test_authentication_endpoints_reject_unsupported_methods(self):
        self.assertEqual(self.client.get(reverse('login')).status_code, 405)
        self.assertEqual(self.client.post(reverse('csrf-token'), HTTP_X_CSRFTOKEN=self.csrf()).status_code, 405)
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.client.get(reverse('logout')).status_code, 405)
        self.assertEqual(self.client.post(reverse('me'), HTTP_X_CSRFTOKEN=self.csrf()).status_code, 405)

    @override_settings(SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True,
                       SECURE_SSL_REDIRECT=True, ALLOWED_HOSTS=['testserver'])
    def test_https_login_sets_secure_cookies_and_rejects_http_origin(self):
        bootstrap = self.client.get(reverse('csrf-token'), secure=True)
        self.assertTrue(bootstrap.cookies['csrftoken']['secure'])
        token = bootstrap.data['csrfToken']
        credentials = {'username': self.hr.username, 'password': self.password}
        response = self.client.post(reverse('login'), credentials, format='json', secure=True,
                                    HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN='http://testserver')
        self.assertEqual(response.status_code, 403)
        response = self.client.post(reverse('login'), credentials, format='json', secure=True,
                                    HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN='https://testserver')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.cookies[settings.SESSION_COOKIE_NAME]['secure'])
        self.assertTrue(response.cookies[settings.SESSION_COOKIE_NAME]['httponly'])
        self.assertTrue(response.cookies['csrftoken']['secure'])
        self.assertEqual(self.client.get(reverse('me'), secure=True).status_code, 200)

    @override_settings(SECURE_SSL_REDIRECT=True)
    def test_http_readiness_checks_database_while_other_routes_redirect(self):
        self.assertEqual(self.client.get(reverse('health')).status_code, 200)
        from django.db import OperationalError
        with patch('config.views.connection.cursor', side_effect=OperationalError('private')):
            self.assertEqual(self.client.get(reverse('health')).status_code, 503)
        response = self.client.get(reverse('me'))
        self.assertEqual(response.status_code, 301)
        self.assertTrue(response['Location'].startswith('https://'))


class CreateHRUserTests(TestCase):
    password = 'Provision-Test-Password-73!'

    def create(self, username='demo-hr', email='demo@example.com', passwords=None):
        output = StringIO()
        with patch('employees.management.commands.create_hr_user.getpass',
                   side_effect=passwords or [self.password, self.password]):
            call_command('create_hr_user', username=username, email=email, stdout=output)
        return output.getvalue()

    def test_creates_active_staff_without_superuser_permissions_or_password_output(self):
        output = self.create()
        user = get_user_model().objects.get(username='demo-hr')
        self.assertTrue(user.check_password(self.password))
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_superuser)
        self.assertFalse(user.user_permissions.exists())
        self.assertNotIn(self.password, output)

    def test_mismatched_and_weak_passwords_create_no_account(self):
        for passwords in [[self.password, 'different'], ['123', '123']]:
            with self.subTest(passwords=passwords), self.assertRaises(CommandError):
                self.create(passwords=passwords)
        self.assertFalse(get_user_model().objects.exists())

    def test_invalid_username_and_email_are_rejected(self):
        for kwargs in [{'username': 'invalid name'}, {'email': 'invalid'}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(CommandError):
                self.create(**kwargs)
        self.assertFalse(get_user_model().objects.exists())

    def test_existing_account_is_not_overwritten_or_promoted(self):
        user = get_user_model().objects.create_user(username='demo-hr', password='existing-password')
        with self.assertRaises(CommandError):
            self.create()
        user.refresh_from_db()
        self.assertFalse(user.is_staff)
        self.assertTrue(user.check_password('existing-password'))

    def test_cancelled_prompt_creates_no_account(self):
        with patch('employees.management.commands.create_hr_user.getpass', side_effect=EOFError):
            with self.assertRaisesMessage(CommandError, 'cancelled'):
                call_command('create_hr_user', username='demo-hr', email='demo@example.com')
        self.assertFalse(get_user_model().objects.exists())
