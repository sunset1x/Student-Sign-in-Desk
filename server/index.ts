import "dotenv/config";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import connectSqlite3 from "connect-sqlite3";
import { db, setting, updateSettings } from "./database.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const SQLiteStore = connectSqlite3(session);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS" && origin && allowedOrigins.includes(origin)) {
    return res.sendStatus(204);
  }
  next();
});
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(
  session({
    store: new SQLiteStore({
      dir: path.dirname(process.env.DATABASE_PATH || "./data/scopely.sqlite"),
    }),
    secret: process.env.SESSION_SECRET || "development-only-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.SECURE_COOKIES === "true",
      httpOnly: true,
      sameSite: process.env.SECURE_COOKIES === "true" ? "none" : "strict",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);
declare module "express-session" {
  interface SessionData {
    admin?: boolean;
  }
}

const requireAdmin = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  if (!req.session.admin)
    return res.status(401).json({ error: "Administrator access required" });
  next();
};

function parseReasons(value: string) {
  try {
    const reasons = JSON.parse(value);
    if (Array.isArray(reasons)) {
      return reasons
        .map((reason) => String(reason).trim())
        .filter(Boolean)
        .slice(0, 30);
    }
  } catch {
    // Use the default list when older or malformed data is encountered.
  }
  return ["Class visit", "Meeting", "Delivery", "Appointment", "Other"];
}

app.get("/api/status", (_req, res) =>
  res.json({
    locked: setting("locked") === "true",
    passwordConfigured: Boolean(setting("admin_password_hash")),
    schoolName: setting("school_name"),
    reasons: parseReasons(setting("visit_reasons")),
  }),
);

app.post("/api/auth/setup", async (req, res) => {
  const schema = z.object({ password: z.string().min(8).max(128) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Password must be 8 to 128 characters" });
  if (setting("admin_password_hash"))
    return res
      .status(409)
      .json({ error: "Administrator password is already configured" });
  updateSettings({
    admin_password_hash: await bcrypt.hash(parsed.data.password, 12),
    locked: "false",
  });
  req.session.admin = true;
  res.json({ ok: true });
});

app.post("/api/auth/unlock", async (req, res) => {
  const schema = z.object({ password: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Password is required" });
  const hash = setting("admin_password_hash");
  if (!hash)
    return res
      .status(409)
      .json({ error: "Create an administrator password first" });
  const validPassword = await bcrypt.compare(parsed.data.password, hash);
  const otpHash = setting("dev_one_time_password_hash");
  const otpExpires = Number(setting("dev_one_time_password_expires") || "0");
  const candidateHash = crypto
    .createHash("sha256")
    .update(parsed.data.password)
    .digest("hex");
  const validOtp =
    otpHash &&
    otpExpires > Date.now() &&
    candidateHash.length === otpHash.length &&
    crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(otpHash));

  if (validOtp) {
    updateSettings({
      dev_one_time_password_hash: "",
      dev_one_time_password_expires: "",
      dev_one_time_password_value: "",
    });
    req.session.admin = true;
    updateSettings({ locked: "false" });
    return res.json({ ok: true });
  }
  if (!validPassword)
    return res.status(401).json({ error: "Incorrect password" });
  req.session.admin = true;
  updateSettings({ locked: "false" });
  res.json({ ok: true });
});

async function verifyAdministratorPassword(password: string) {
  const hash = setting("admin_password_hash");
  return Boolean(hash && password && (await bcrypt.compare(password, hash)));
}

app.post("/api/dev/access", async (req, res) => {
  const parsed = z.object({ password: z.string() }).safeParse(req.body);
  if (!parsed.success || !(await verifyAdministratorPassword(parsed.data.password)))
    return res.status(401).json({ error: "Incorrect administrator password" });
  res.json({ ok: true });
});

app.post("/api/dev/one-time-password", async (req, res) => {
  const parsed = z.object({ password: z.string() }).safeParse(req.body);
  if (!parsed.success || !(await verifyAdministratorPassword(parsed.data.password)))
    return res.status(401).json({ error: "Incorrect administrator password" });

  const existingExpiresAt = Number(setting("dev_one_time_password_expires") || "0");
  if (setting("dev_one_time_password_hash") && existingExpiresAt > Date.now())
    return res.status(409).json({ error: "An active one-time password already exists" });

  const oneTimePassword = crypto.randomInt(10000000, 100000000).toString();
  const hash = crypto
    .createHash("sha256")
    .update(oneTimePassword)
    .digest("hex");
  const expiresAt = Date.now() + 10 * 60 * 1000;
  updateSettings({
    dev_one_time_password_hash: hash,
    dev_one_time_password_expires: String(expiresAt),
    dev_one_time_password_value: oneTimePassword,
  });
  res.json({ password: oneTimePassword, expiresAt });
});

app.post("/api/dev/one-time-password/status", async (req, res) => {
  const parsed = z.object({ password: z.string() }).safeParse(req.body);
  if (!parsed.success || !(await verifyAdministratorPassword(parsed.data.password)))
    return res.status(401).json({ error: "Incorrect administrator password" });

  const expiresAt = Number(setting("dev_one_time_password_expires") || "0");
  if (expiresAt <= Date.now()) {
    updateSettings({
      dev_one_time_password_hash: "",
      dev_one_time_password_expires: "",
      dev_one_time_password_value: "",
    });
    return res.json({ active: false });
  }
  res.json({
    active: Boolean(setting("dev_one_time_password_hash")),
    password: setting("dev_one_time_password_value") || "",
    expiresAt,
  });
});
app.post("/api/auth/logout", (req, res) =>
  req.session.destroy(() => res.json({ ok: true })),
);

app.post("/api/auth/skip", (req, res) => {
  if (setting("admin_password_hash"))
    return res
      .status(409)
      .json({ error: "Administrator password is configured" });
  updateSettings({ locked: "false" });
  req.session.admin = true;
  res.json({ ok: true });
});

app.post("/api/lock", (req, res) => {
  updateSettings({ locked: "true" });
  req.session.admin = false;
  res.json({ ok: true });
});

app.post("/api/unlock", (req, res) => {
  updateSettings({ locked: "false" });
  req.session.admin = true;
  res.json({ ok: true });
});

app.get("/api/teachers", (_req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM teachers WHERE active = 1 ORDER BY sort_order, last_name, first_name",
    )
    .all();
  res.json(rows);
});
app.put("/api/teachers/order", requireAdmin, (req, res) => {
  const schema = z.object({
    ids: z.array(z.coerce.number().int().positive()).max(500),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid teacher order" });
  const update = db.prepare(
    "UPDATE teachers SET sort_order = ? WHERE id = ? AND active = 1",
  );
  db.transaction(() =>
    parsed.data.ids.forEach((id, index) => update.run(index, id)),
  )();
  res.json({ ok: true });
});
app.post("/api/teachers", requireAdmin, (req, res) => {
  const schema = z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.string().email().or(z.literal("")),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "A valid first name and last name are required" });
  const result = db
    .prepare(
      "INSERT INTO teachers (first_name, last_name, email) VALUES (?, ?, ?)",
    )
    .run(parsed.data.firstName, parsed.data.lastName, parsed.data.email);
  res
    .status(201)
    .json(
      db
        .prepare("SELECT * FROM teachers WHERE id = ?")
        .get(result.lastInsertRowid),
    );
});
app.put("/api/teachers/:id", requireAdmin, (req, res) => {
  const teacherId = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!teacherId.success)
    return res.status(400).json({ error: "Invalid teacher" });
  const parsed = z
    .object({
      firstName: z.string().trim().min(1).max(60),
      lastName: z.string().trim().min(1).max(60),
      email: z
        .union([z.string().email(), z.literal(""), z.null()])
        .transform((value) => value ?? ""),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Enter a valid teacher name and email address" });
  const result = db
    .prepare(
      "UPDATE teachers SET first_name = ?, last_name = ?, email = ? WHERE id = ? AND active = 1",
    )
    .run(
      parsed.data.firstName,
      parsed.data.lastName,
      parsed.data.email,
      teacherId.data,
    );
  if (result.changes === 0)
    return res.status(404).json({ error: "Teacher not found" });
  res.json(
    db.prepare("SELECT * FROM teachers WHERE id = ?").get(teacherId.data),
  );
});
app.delete("/api/teachers/:id", requireAdmin, (req, res) => {
  db.prepare("UPDATE teachers SET active = 0 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] || character,
  );
}

function fillEmailTemplate(template: string, values: Record<string, string>) {
  return template.replace(/@[a-zA-Z0-9_]+/g, (command) => {
    const key = command.slice(1);
    return values[key] ?? command;
  });
}

async function sendNotification(signIn: {
  firstName: string;
  lastName: string;
  teacherName: string;
  reason: string;
}) {
  if (!setting("smtp_host") || !setting("notification_email")) return false;
  const transporter = nodemailer.createTransport({
    host: setting("smtp_host"),
    port: Number(setting("smtp_port") || 587),
    secure: setting("smtp_secure") === "true",
    auth: setting("smtp_user")
      ? { user: setting("smtp_user"), pass: setting("smtp_pass") }
      : undefined,
  });
  const signedInAt = new Date().toLocaleString();
  const schoolName = setting("school_name") || "School office";
  const officeName = setting("office_name") || "Main office";
  const visitorName = escapeHtml(`${signIn.firstName} ${signIn.lastName}`);
  const teacherName = escapeHtml(signIn.teacherName);
  const reason = escapeHtml(signIn.reason);
  const safeSchoolName = escapeHtml(schoolName);
  const safeOfficeName = escapeHtml(officeName);
  const templateValues = {
    visitor: `${signIn.firstName} ${signIn.lastName}`,
    visitorName: `${signIn.firstName} ${signIn.lastName}`,
    visitorFirstName: signIn.firstName,
    visitorLastName: signIn.lastName,
    teacher: signIn.teacherName,
    reason: signIn.reason,
    school: schoolName,
    office: officeName,
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    dateTime: signedInAt,
  };
  const subjectTemplate =
    setting("notification_email_subject") || "Visitor sign-in: @visitorName";
  const messageTemplate =
    setting("notification_email_message") ||
    "Hello @teacher,\n\n@visitorName has arrived for a visit.\n\nReason: @reason\nOffice: @office\nSchool: @school\nSigned in: @dateTime";
  const customText = fillEmailTemplate(messageTemplate, templateValues);
  const customHtml = escapeHtml(customText).replace(/\r?\n/g, "<br>");
  await transporter.sendMail({
    from: setting("mail_from"),
    to: setting("notification_email"),
    subject: fillEmailTemplate(subjectTemplate, templateValues),
    text: customText,
    html: `<div style="font-family:Arial,sans-serif;color:#18352a;line-height:1.5"><h2 style="color:#0c4b37;margin-bottom:4px">New visitor sign-in</h2><p style="margin-top:0;color:#66736c">${safeSchoolName} · ${safeOfficeName}</p><p>${customHtml}</p></div>`,
  });
  return true;
}

app.post("/api/sign-ins", async (req, res) => {
  const schema = z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    teacherId: z.coerce.number().int().positive(),
    reason: z.string().trim().min(1).max(120),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Please complete every field" });
  if (!parseReasons(setting("visit_reasons")).includes(parsed.data.reason))
    return res.status(400).json({ error: "Selected reason is unavailable" });
  const teacher = db
    .prepare("SELECT * FROM teachers WHERE id = ? AND active = 1")
    .get(parsed.data.teacherId) as
    | { first_name: string; last_name: string }
    | undefined;
  if (!teacher)
    return res.status(400).json({ error: "Selected teacher is unavailable" });
  let emailStatus = "not_sent";
  try {
    emailStatus = (await sendNotification({
      ...parsed.data,
      teacherName: `${teacher.first_name} ${teacher.last_name}`,
    }))
      ? "sent"
      : "not_sent";
  } catch {
    emailStatus = "failed";
  }
  const result = db
    .prepare(
      "INSERT INTO sign_ins (first_name, last_name, teacher_id, reason, email_status) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      parsed.data.firstName,
      parsed.data.lastName,
      parsed.data.teacherId,
      parsed.data.reason,
      emailStatus,
    );
  res.status(201).json({ id: result.lastInsertRowid });
});

app.get("/api/sign-ins", requireAdmin, (req, res) => {
  const search = String(req.query.q || "")
    .trim()
    .toLowerCase();
  const rows = db
    .prepare(
      `SELECT s.*, t.first_name AS teacher_first, t.last_name AS teacher_last FROM sign_ins s JOIN teachers t ON t.id = s.teacher_id ORDER BY s.created_at DESC LIMIT 200`,
    )
    .all() as Array<Record<string, unknown>>;
  const filtered = search
    ? rows.filter((row) =>
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(search),
        ),
      )
    : rows;
  res.json(filtered);
});
app.get("/api/settings", requireAdmin, (_req, res) =>
  res.json(
    Object.fromEntries(
      db
        .prepare("SELECT key, value FROM settings")
        .all()
        .map((row: unknown) => {
          const r = row as { key: string; value: string };
          return [r.key, r.key.includes("pass") ? undefined : r.value];
        }),
    ),
  ),
);
app.put("/api/settings", requireAdmin, (req, res) => {
  const allowed = [
    "school_name",
    "office_name",
    "smtp_host",
    "smtp_port",
    "smtp_secure",
    "smtp_user",
    "smtp_pass",
    "mail_from",
    "notification_email",
    "notification_email_subject",
    "notification_email_message",
    "visit_reasons",
  ];
  const values = Object.fromEntries(
    Object.entries(req.body)
      .filter(([key]) => allowed.includes(key))
      .map(([key, value]) => [key, String(value ?? "")]),
  ) as Record<string, string>;
  updateSettings(values);
  res.json({ ok: true });
});
app.put("/api/password", requireAdmin, async (req, res) => {
  const schema = z
    .object({
      currentPassword: z.string(),
      password: z.string().min(8).max(128),
      repeatPassword: z.string(),
    })
    .refine((value) => value.password === value.repeatPassword, {
      message: "Passwords must match",
    });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || "Password details are invalid",
    });
  const hash = setting("admin_password_hash");
  const validCurrent =
    hash && (await bcrypt.compare(parsed.data.currentPassword, hash));
  if (!validCurrent)
    return res.status(401).json({ error: "Current password is incorrect" });
  updateSettings({
    admin_password_hash: await bcrypt.hash(parsed.data.password, 12),
  });
  res.json({ ok: true });
});

function resetAllData() {
  db.transaction(() => {
    db.prepare("DELETE FROM sign_ins").run();
    db.prepare("DELETE FROM teachers").run();
    db.prepare("DELETE FROM settings").run();
    const defaults = {
      school_name: "Lincoln High School",
      office_name: "Main Office",
      locked: "true",
      smtp_host: "",
      smtp_port: "587",
      smtp_secure: "false",
      smtp_user: "",
      smtp_pass: "",
      mail_from: "Skully <kiosk@example.edu>",
      notification_email: "",
      notification_email_subject: "Visitor sign-in: @visitorName",
      notification_email_message:
        "Hello @teacher,\n\n@visitorName has arrived for a visit.\n\nReason: @reason\nOffice: @office\nSchool: @school\nSigned in: @dateTime",
    };
    const insert = db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?)",
    );
    for (const [key, value] of Object.entries(defaults)) insert.run(key, value);
  })();
}

app.post("/api/dev/reset", async (req, res) => {
  const parsed = z.object({ password: z.string() }).safeParse(req.body);
  if (!parsed.success || !(await verifyAdministratorPassword(parsed.data.password)))
    return res.status(401).json({ error: "Incorrect administrator password" });
  resetAllData();
  req.session.admin = false;
  res.json({ ok: true });
});

app.post("/api/reset", requireAdmin, async (req, res) => {
  const parsed = z.object({ password: z.string() }).safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Password is required" });
  const hash = setting("admin_password_hash");
  if (!hash)
    return res
      .status(409)
      .json({ error: "Create an administrator password first" });
  const validPassword = await bcrypt.compare(parsed.data.password, hash);
  if (!validPassword)
    return res.status(401).json({ error: "Password is incorrect" });

  resetAllData();
  req.session.admin = false;
  res.json({ ok: true });
});

const dist = path.resolve("dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
app.listen(port, () =>
  console.log(`Skully running on http://localhost:${port}`),
);
