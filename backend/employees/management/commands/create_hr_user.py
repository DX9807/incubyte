from getpass import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction


class Command(BaseCommand):
    help = 'Interactively create an active HR staff user without superuser privileges.'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True)
        parser.add_argument('--email', required=True)

    def handle(self, *args, **options):
        user = get_user_model()(username=options['username'], email=options['email'],
                                is_staff=True, is_active=True, is_superuser=False)
        try:
            user.full_clean(exclude=['password'])
            password = getpass('Password: ')
            confirmation = getpass('Password (again): ')
            if password != confirmation:
                raise CommandError('Passwords do not match; no user created.')
            validate_password(password, user=user)
        except ValidationError as error:
            raise CommandError('; '.join(error.messages)) from error
        except (EOFError, KeyboardInterrupt) as error:
            raise CommandError('User creation cancelled.') from error

        user.set_password(password)
        try:
            with transaction.atomic():
                user.save()
        except IntegrityError as error:
            raise CommandError('User conflicts with an existing account; no user created.') from error
        self.stdout.write(self.style.SUCCESS(f'Created HR staff user {user.username}.'))
