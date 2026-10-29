"""Run from the repository root: gunicorn --config gunicorn.conf.py config.wsgi:application."""

import os
from pathlib import Path

chdir = str(Path(__file__).resolve().parent / 'backend')
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = int(os.environ.get('WEB_CONCURRENCY', '2'))
timeout = 30
accesslog = '-'
errorlog = '-'
