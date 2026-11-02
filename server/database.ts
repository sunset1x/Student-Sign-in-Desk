import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const databasePath = process.env.DATABASE_PATH || "./data/scopely.sqlite";
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sign_ins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  reason TEXT NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'not_sent' CHECK (email_status IN ('sent', 'failed', 'not_sent')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sign_ins_created ON sign_ins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teachers_active ON teachers(active);
`;
db.exec(schema.replaceAll("TEXT NOT NOT NULL", "TEXT NOT NULL"));
const teacherColumns = db
  .prepare("PRAGMA table_info(teachers)")
  .all() as Array<{ name: string }>;
if (!teacherColumns.some((column) => column.name === "sort_order")) {
  db.exec(
    "ALTER TABLE teachers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
  );
}

const defaults: Record<string, string> = {
  school_name: "Lincoln High School",
  office_name: "Main Office",
  smtp_host: process.env.SMTP_HOST || "",
  smtp_port: process.env.SMTP_PORT || "587",
  smtp_secure: process.env.SMTP_SECURE || "false",
  smtp_user: process.env.SMTP_USER || "",
  smtp_pass: process.env.SMTP_PASS || "",
  mail_from: process.env.MAIL_FROM || "Skully <kiosk@example.edu>",
  notification_email: process.env.NOTIFICATION_EMAIL || "",
  notification_email_subject: "Visitor sign-in: @visitorName",
  notification_email_message:
    "Hello @teacher,\n\n@visitorName has arrived for a visit.\n\nReason: @reason\nOffice: @office\nSchool: @school\nSigned in: @dateTime",
  visit_reasons: JSON.stringify([
    "Class visit",
    "Meeting",
    "Delivery",
    "Appointment",
    "Other",
  ]),
  locked: "true",
};
const insertSetting = db.prepare(
  "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
);
const seed = db.transaction(() => {
  for (const [key, value] of Object.entries(defaults))
    insertSetting.run(key, value);
});
seed();

export function setting(key: string): string {
  return (
    (
      db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
        | { value: string }
        | undefined
    )?.value ?? ""
  );
}
export function updateSettings(values: Record<string, string>) {
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(values)) upsert.run(key, value);
  });
  transaction();
}
