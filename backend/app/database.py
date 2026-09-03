"""Zuri database layer — SQLite with WAL mode for concurrent reads."""

import sqlite3
import os
from pathlib import Path

DB_PATH = Path(os.getenv("DATABASE_PATH", str(Path(__file__).resolve().parent.parent / "zuri.db")))


def get_db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE NOT NULL,
            email TEXT,
            full_name TEXT NOT NULL,
            language_pref TEXT DEFAULT 'en',
            pin_hash TEXT,
            password_hash TEXT,
            biometric_enabled INTEGER DEFAULT 0,
            daily_biometric_limit_kobo INTEGER DEFAULT 5000000
        );

        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            monnify_reserved_account TEXT,
            bank_name TEXT DEFAULT 'Wema Bank',
            balance_kobo INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS beneficiaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            nickname TEXT,
            full_name TEXT NOT NULL,
            account_number TEXT NOT NULL,
            bank_code TEXT NOT NULL,
            send_count INTEGER DEFAULT 0,
            usual_amount_kobo INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            monnify_ref TEXT,
            direction TEXT NOT NULL,
            amount_kobo INTEGER NOT NULL,
            counterparty_name TEXT,
            category TEXT DEFAULT 'transfers',
            status TEXT DEFAULT 'completed',
            timestamp TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            current_amount_kobo INTEGER DEFAULT 0,
            target_amount_kobo INTEGER NOT NULL,
            target_date TEXT,
            recurring_amount_kobo INTEGER DEFAULT 0,
            monnify_mandate_ref TEXT,
            status TEXT DEFAULT 'active',
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            text TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS automations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            trigger_config TEXT,
            action_type TEXT NOT NULL,
            action_config TEXT,
            active INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS idempotency_keys (
            user_id INTEGER NOT NULL,
            key TEXT NOT NULL,
            response_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (user_id, key),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_user_timestamp
            ON transactions(user_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_beneficiaries_user_account
            ON beneficiaries(user_id, account_number, bank_code);
    """)

    columns = {row[1] for row in cursor.execute("PRAGMA table_info(users)").fetchall()}
    if "password_hash" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")

    account_columns = {row[1] for row in cursor.execute("PRAGMA table_info(accounts)").fetchall()}
    if "monnify_account_ref" not in account_columns:
        cursor.execute("ALTER TABLE accounts ADD COLUMN monnify_account_ref TEXT")

    conn.commit()
    conn.close()
