"""Shared catalog access; every process uses its own service credentials."""
import contextlib
import json
import os
from pathlib import Path
import threading
import psycopg
from psycopg.rows import dict_row

ROOT = Path(os.environ.get('TAKANEKO_DATA', '/var/lib/takaneko'))
CONTROL = Path(os.environ.get('TAKANEKO_CONTROL', '/var/lib/takaneko-control'))
DB_CONFIG = Path(os.environ.get('TAKANEKO_DB_CONFIG', '/etc/vm1-backup/services/takaneko.json'))
DB_SLOTS = threading.BoundedSemaphore(4)


@contextlib.contextmanager
def db():
    config = json.loads(DB_CONFIG.read_text())['database']
    # vm1-backup service config is also accepted by the installed helper.
    with DB_SLOTS:
        with psycopg.connect(host=config.get('host', '127.0.0.1'), port=config.get('port', 5432),
                             dbname=config.get('dbname', config.get('database', 'vm1_backup')),
                             user=config.get('user', config.get('username')), password=config['password'],
                             row_factory=dict_row) as conn:
            conn.execute('SET search_path TO takaneko')
            yield conn


def query(sql, params=(), one=False):
    with db() as conn:
        cursor = conn.execute(sql, params)
        if cursor.description:
            return cursor.fetchone() if one else cursor.fetchall()


def initialize():
    with db() as conn:
        conn.execute('''
        CREATE TABLE IF NOT EXISTS settings (
          id integer PRIMARY KEY CHECK(id=1), concurrency integer NOT NULL DEFAULT 5 CHECK(concurrency BETWEEN 1 AND 100),
          blogs boolean NOT NULL DEFAULT true);
        INSERT INTO settings(id) VALUES(1) ON CONFLICT DO NOTHING;
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_enabled boolean NOT NULL DEFAULT true;
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_interval_hours integer NOT NULL DEFAULT 6 CHECK(auto_interval_hours BETWEEN 1 AND 168);
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_next_at timestamptz DEFAULT now();
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_last_at timestamptz;
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS auto_message text NOT NULL DEFAULT '等待排程檢查';
        CREATE TABLE IF NOT EXISTS jobs (
          id text PRIMARY KEY, status text NOT NULL, command text NOT NULL DEFAULT 'run',
          total integer NOT NULL DEFAULT 0, completed integer NOT NULL DEFAULT 0,
          failed integer NOT NULL DEFAULT 0, message text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
        CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs ((true)) WHERE status IN ('queued','running','paused');
        ALTER TABLE jobs ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'manual';
        CREATE TABLE IF NOT EXISTS posts (
          resource_key text PRIMARY KEY, source_id text NOT NULL, kind text NOT NULL,
          title text NOT NULL, member text NOT NULL, body text NOT NULL,
          folder text NOT NULL, nas_folder text NOT NULL, version text NOT NULL,
          nas_available boolean NOT NULL DEFAULT false, transfer_error boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now());
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS local_available boolean NOT NULL DEFAULT true;
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS nas_layout_ready boolean NOT NULL DEFAULT false;
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS nas_migration_pending boolean NOT NULL DEFAULT false;
        CREATE TABLE IF NOT EXISTS backup_jobs (
          id text PRIMARY KEY, status text NOT NULL DEFAULT 'queued', trigger text NOT NULL DEFAULT 'manual',
          total integer NOT NULL DEFAULT 0, completed integer NOT NULL DEFAULT 0, failed integer NOT NULL DEFAULT 0,
          files_done bigint NOT NULL DEFAULT 0, bytes_done bigint NOT NULL DEFAULT 0,
          current_item text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '等待備份程序',
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
        CREATE UNIQUE INDEX IF NOT EXISTS one_active_backup ON backup_jobs ((true)) WHERE status IN ('queued','running');
        CREATE TABLE IF NOT EXISTS desktop_imports (
          snapshot text PRIMARY KEY, files integer NOT NULL, bytes bigint NOT NULL,
          posts integer NOT NULL, manifest_sha256 text NOT NULL, verified_at timestamptz NOT NULL DEFAULT now());
        CREATE TABLE IF NOT EXISTS desktop_thumbnail_backups (
          snapshot text PRIMARY KEY, folder text NOT NULL, nas_folder text NOT NULL,
          nas_available boolean NOT NULL DEFAULT false, transfer_error boolean NOT NULL DEFAULT false);
        CREATE TABLE IF NOT EXISTS media (
          media_id text PRIMARY KEY, resource_key text NOT NULL REFERENCES posts(resource_key),
          version text NOT NULL, variant text NOT NULL, relative_path text NOT NULL,
          nas_path text NOT NULL, sha256 text NOT NULL, size bigint NOT NULL, mime text NOT NULL,
          width integer, height integer, owner_id text NOT NULL DEFAULT 'owner',
          permission text NOT NULL DEFAULT 'private', local_available boolean NOT NULL DEFAULT true,
          nas_available boolean NOT NULL DEFAULT false, local_verified_at timestamptz DEFAULT now(),
          nas_verified_at timestamptz, original_id text,
          UNIQUE(resource_key,relative_path,variant));
        ALTER TABLE media ALTER COLUMN local_verified_at DROP NOT NULL;
        ALTER TABLE media ADD COLUMN IF NOT EXISTS nas_previous_path text;
        CREATE INDEX IF NOT EXISTS posts_member_date ON posts(member,created_at DESC,resource_key);
        CREATE INDEX IF NOT EXISTS media_thumbnail_original ON media(original_id) WHERE variant='thumbnail';
        ''')
