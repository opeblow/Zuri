import sqlite3
import os
from pathlib import Path
from datetime import datetime, timedelta
import random
import hashlib
from .services.auth_service import hash_pin

DB_PATH = Path(__file__).resolve().parent.parent / "zuri.db"


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
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

    conn.commit()
    conn.close()


def seed_demo_data():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    now = datetime.utcnow()
    pin_hash = hash_pin("1234")

    cursor.execute("""
        INSERT INTO users (phone, email, full_name, language_pref, pin_hash, biometric_enabled, daily_biometric_limit_kobo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ("+2348012345678", "amina@example.com", "Amina Okonkwo", "en", pin_hash, 1, 5000000))
    user_id = cursor.lastrowid

    cursor.execute("""
        INSERT INTO accounts (user_id, monnify_reserved_account, bank_name, balance_kobo)
        VALUES (?, ?, ?, ?)
    """, (user_id, "1234567890", "Wema Bank", 29500000))

    beneficiaries_data = [
        (user_id, "Mummy", "Grace Okonkwo", "0123456789", "044", 12, 2500000),
        (user_id, "Ada", "Adaeze Nwosu", "0987654321", "058", 8, 500000),
        (user_id, "Landlord", "Chief Emeka Obi", "1122334455", "033", 6, 1500000),
    ]
    cursor.executemany("""
        INSERT INTO beneficiaries (user_id, nickname, full_name, account_number, bank_code, send_count, usual_amount_kobo)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, beneficiaries_data)

    goals_data = [
        (user_id, "Rent 2027", 18000000, 24000000, "2027-06-01", 5000000, "active"),
        (user_id, "New Phone", 3500000, 7500000, "2026-12-25", 1000000, "active"),
        (user_id, "Tax Pot", 2000000, 5000000, "2026-12-31", 2000000, "active"),
    ]
    cursor.executemany("""
        INSERT INTO goals (user_id, name, current_amount_kobo, target_amount_kobo, target_date, recurring_amount_kobo, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, goals_data)

    transactions_data = []
    base_date = now - timedelta(days=30)

    salary_date = base_date + timedelta(days=1)
    transactions_data.append((user_id, f"MON-SAL-{random.randint(1000,9999)}", "credit", 35000000, "TechCorp Ltd", "income", "completed", salary_date.isoformat()))

    for i in range(1, 6):
        tx_date = base_date + timedelta(days=i * 5)
        transactions_data.append((user_id, f"MON-TX-{random.randint(1000,9999)}", "debit", 2500000, "Grace Okonkwo", "transfers", "completed", tx_date.isoformat()))

    transactions_data.append((user_id, f"MON-TX-{random.randint(1000,9999)}", "debit", 500000, "Adaeze Nwosu", "transfers", "completed", (base_date + timedelta(days=12)).isoformat()))

    transactions_data.append((user_id, f"MON-BL-{random.randint(1000,9999)}", "debit", 1500000, "Chief Emeka Obi", "bills", "completed", (base_date + timedelta(days=3)).isoformat()))
    transactions_data.append((user_id, f"MON-BL-{random.randint(1000,9999)}", "debit", 750000, "IKEJA Electric", "bills", "completed", (base_date + timedelta(days=8)).isoformat()))
    transactions_data.append((user_id, f"MON-BL-{random.randint(1000,9999)}", "debit", 350000, "MTN Nigeria", "bills", "completed", (base_date + timedelta(days=15)).isoformat()))

    transactions_data.append((user_id, f"MON-LF-{random.randint(1000,9999)}", "debit", 450000, "Shoprite", "lifestyle", "completed", (base_date + timedelta(days=6)).isoformat()))
    transactions_data.append((user_id, f"MON-LF-{random.randint(1000,9999)}", "debit", 850000, "Filmhouse Cinema", "lifestyle", "completed", (base_date + timedelta(days=10)).isoformat()))
    transactions_data.append((user_id, f"MON-LF-{random.randint(1000,9999)}", "debit", 1200000, "SPAR Mall", "lifestyle", "completed", (base_date + timedelta(days=18)).isoformat()))

    transactions_data.append((user_id, f"MON-SH-{random.randint(1000,9999)}", "debit", 2200000, "Jumia Nigeria", "shopping", "completed", (base_date + timedelta(days=4)).isoformat()))
    transactions_data.append((user_id, f"MON-SH-{random.randint(1000,9999)}", "debit", 650000, "Konga", "shopping", "completed", (base_date + timedelta(days=20)).isoformat()))
    transactions_data.append((user_id, f"MON-SH-{random.randint(1000,9999)}", "debit", 1800000, "Slot Systems", "shopping", "completed", (base_date + timedelta(days=25)).isoformat()))

    transactions_data.append((user_id, f"MON-TX-{random.randint(1000,9999)}", "credit", 2000000, "Damilare Enterprises", "transfers", "completed", (base_date + timedelta(days=14)).isoformat()))

    cursor.executemany("""
        INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, transactions_data)

    conn.commit()
    conn.close()
