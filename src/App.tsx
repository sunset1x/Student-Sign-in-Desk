import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CircleHelp,
  Eye,
  EyeOff,
  LockKeyhole,
  MoveVertical,
  PencilLine,
  RotateCcw,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Skull,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";

function useBackdropDismiss(onDismiss: () => void) {
  const start = useRef<{ x: number; y: number; backdrop: boolean } | null>(
    null,
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    start.current = {
      x: event.clientX,
      y: event.clientY,
      backdrop: event.target === event.currentTarget,
    };
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pressedBackdrop = start.current;
    start.current = null;
    if (!pressedBackdrop?.backdrop || event.target !== event.currentTarget)
      return;
    const moved =
      Math.abs(event.clientX - pressedBackdrop.x) +
      Math.abs(event.clientY - pressedBackdrop.y);
    if (moved <= 8) onDismiss();
  };

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel: () => {
      start.current = null;
    },
  };
}

type Page = "sign-in" | "settings" | "logs";
type Theme = "forest" | "slate" | "sunset";
type Teacher = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
};
type SignIn = {
  id: number;
  first_name: string;
  last_name: string;
  teacher_first: string;
  teacher_last: string;
  reason: string;
  email_status: string;
  created_at: string;
};

async function api(path: string, options?: RequestInit) {
  const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const response = await fetch(`${apiBase}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export default function App() {
  const [page, setPage] = useState<Page>("sign-in");
  const [locked, setLocked] = useState(true);
  const [passwordConfigured, setPasswordConfigured] = useState(true);
  const [schoolName, setSchoolName] = useState("Lincoln High School");
  const [modal, setModal] = useState(false);
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [logs, setLogs] = useState<SignIn[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<string[]>([]);
  const [managementOpen, setManagementOpen] = useState(false);
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false);
  const [logsRefreshing, setLogsRefreshing] = useState(false);
  const [startupGuideOpen, setStartupGuideOpen] = useState(false);
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem("skully-theme");
    return saved === "slate" || saved === "sunset" ? saved : "forest";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("skully-theme", theme);
  }, [theme]);

  const refreshStatus = async () => {
    const status = await api("/status");
    setLocked(status.locked);
    setPasswordConfigured(status.passwordConfigured);
    const resetRequiresGuide =
      window.sessionStorage.getItem("skully-setup-required") === "true";
    const skippedGuide =
      window.localStorage.getItem("skully-startup-guide-completed") === "true";
    if (!status.passwordConfigured && (resetRequiresGuide || !skippedGuide))
      setStartupGuideOpen(true);
    setSchoolName(status.schoolName);
    setReasons(Array.isArray(status.reasons) ? status.reasons : []);
  };
  const refreshTeachers = async () => setTeachers(await api("/teachers"));
  const refreshLogs = async () => setLogs(await api("/sign-ins"));
  const refreshLogsAnimated = async () => {
    if (logsRefreshing) return;
    setLogsRefreshing(true);
    try {
      await refreshLogs();
    } finally {
      window.setTimeout(() => setLogsRefreshing(false), 450);
    }
  };
  const refreshSettings = async () => setSettings(await api("/settings"));

  useEffect(() => {
    refreshStatus().catch(() => undefined);
    refreshTeachers().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (startupGuideOpen) return;
        if (locked) setModal((current) => !current);
        else setModal(false);
        return;
      }
      if (event.key === "F10") {
        event.preventDefault();
        setDevToolsOpen(true);
        return;
      }

      const target = event.target as HTMLElement;
      const isTyping = target.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
      if (
        !isTyping &&
        event.key.toLowerCase() === "l" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !locked
      ) {
        event.preventDefault();
        if (!passwordConfigured) {
          setNotice("Create a password first");
          return;
        }
        void api("/lock", { method: "POST" }).then(() => {
          setLocked(true);
          setPage("sign-in");
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, passwordConfigured, startupGuideOpen]);

  const navigate = (next: Page) => {
    setPage(next);
    if (next === "logs")
      refreshLogs().catch((error) => setNotice(error.message));
    if (next === "settings")
      refreshSettings().catch((error) => setNotice(error.message));
  };
  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    try {
      try {
        await api("/auth/unlock", {
          method: "POST",
          body: JSON.stringify({ password }),
        });
      } catch {
        await api("/auth/temporary", {
          method: "POST",
          body: JSON.stringify({ password }),
        });
      }
      setPassword("");
      setModal(false);
      setLocked(false);
      await refreshStatus();
      await refreshTeachers();
    } catch (error) {
      setNotice((error as Error).message);
    }
  };
  const lock = async () => {
    if (!passwordConfigured) {
      setNotice("Create a password first");
      return;
    }
    await api("/lock", { method: "POST" });
    setLocked(true);
    setPage("sign-in");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Logo />
        <nav
          className={`nav-pill ${locked ? "nav-hidden" : ""}`}
          aria-label="Primary navigation"
        >
          <button
            className={page === "sign-in" ? "active" : ""}
            onClick={() => navigate("sign-in")}
          >
            <PencilLine size={17} /> Sign in
          </button>
          {!locked && (
            <>
              <button
                className={page === "logs" ? "active" : ""}
                onClick={() => navigate("logs")}
              >
                <ClipboardList size={17} /> Logs
              </button>
              <button
                className={page === "settings" ? "active" : ""}
                onClick={() => navigate("settings")}
              >
                <SlidersHorizontal size={17} /> Settings
              </button>
            </>
          )}
        </nav>
        {!locked && (
          <button
            className="lock-button"
            onClick={lock}
            aria-disabled={!passwordConfigured}
            title={
              passwordConfigured ? "Lock kiosk (L)" : "Create a password first"
            }
          >
            <LockKeyhole size={18} /> Lock <kbd>L</kbd>
          </button>
        )}
        {locked && (
          <button
            className="lock-button lock-key"
            onClick={() => setModal(true)}
            title="Administrator unlock"
          >
            <LockKeyhole size={18} />
          </button>
        )}
      </header>

      {page === "sign-in" && (
        <SignInPage
          schoolName={schoolName}
          teachers={teachers}
          reasons={reasons}
          refreshTeachers={refreshTeachers}
          locked={locked}
          onNotice={setNotice}
        />
      )}
      {!locked && page === "settings" && (
        <SettingsPage
          settings={settings}
          passwordConfigured={passwordConfigured}
          refreshPasswordStatus={refreshStatus}
          refreshStatus={refreshStatus}
          teachers={teachers}
          refreshTeachers={refreshTeachers}
          refreshSettings={refreshSettings}
          setManagementOpen={setManagementOpen}
          setEmailTemplateOpen={setEmailTemplateOpen}
          theme={theme}
          setTheme={setTheme}
          onNotice={setNotice}
        />
      )}
      {!locked && page === "logs" && (
        <LogsPage logs={logs} refreshLogs={refreshLogsAnimated} />
      )}

      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {managementOpen && (
        <DirectoryModal
          settings={settings}
          teachers={teachers}
          refreshTeachers={refreshTeachers}
          refreshSettings={refreshSettings}
          refreshStatus={refreshStatus}
          onNotice={setNotice}
          onClose={() => setManagementOpen(false)}
        />
      )}
      {emailTemplateOpen && (
        <EmailTemplateModal
          subject={settings.notification_email_subject || ""}
          message={settings.notification_email_message || ""}
          onSave={async (subject, message) => {
            await api("/settings", {
              method: "PUT",
              body: JSON.stringify({
                notification_email_subject: subject,
                notification_email_message: message,
              }),
            });
            await refreshSettings();
            setEmailTemplateOpen(false);
            setNotice("Email message updated");
          }}
          onClose={() => setEmailTemplateOpen(false)}
        />
      )}
      {logsRefreshing && (
        <div className="logs-refresh-overlay" aria-hidden="true">
          <div className="logs-refresh-pulse">
            <RefreshCw size={22} />
          </div>
        </div>
      )}
      {devToolsOpen && (
        <DevToolsModal
          theme={theme}
          setTheme={setTheme}
          onReset={async (password) => {
            await api("/reset", {
              method: "POST",
              body: JSON.stringify({ password }),
            });
            window.localStorage.removeItem("skully-theme");
            setTheme("forest");
            setLocked(true);
            setPage("sign-in");
            await refreshStatus();
            setDevToolsOpen(false);
            setNotice("All kiosk data was reset");
          }}
          onClose={() => setDevToolsOpen(false)}
          onNotice={setNotice}
        />
      )}
      {modal && (
        <UnlockModal
          configured={passwordConfigured}
          password={password}
          setPassword={setPassword}
          onSubmit={unlock}
          onCancel={() => {
            setModal(false);
            setPassword("");
            setNotice("");
          }}
        />
      )}
      {startupGuideOpen && (
        <StartupGuide
          theme={theme}
          setTheme={setTheme}
          onComplete={async () => {
            window.sessionStorage.removeItem("skully-setup-required");
            window.localStorage.setItem(
              "skully-startup-guide-completed",
              "true",
            );
            await refreshStatus();
            setStartupGuideOpen(false);
          }}
          onSkip={async () => {
            await api("/auth/skip", { method: "POST" }).catch(() => undefined);
            window.sessionStorage.removeItem("skully-setup-required");
            window.localStorage.setItem(
              "skully-startup-guide-completed",
              "true",
            );
            setStartupGuideOpen(false);
            setLocked(false);
            setNotice("Create a password first before locking the kiosk");
          }}
        />
      )}
    </div>
  );
}

function StartupGuide({
  theme,
  setTheme,
  onComplete,
  onSkip,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onComplete: () => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const createPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== repeatPassword) {
      setError("Passwords must match");
      return;
    }
    setSaving(true);
    try {
      await api("/auth/setup", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await onComplete();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop startup-backdrop" role="presentation">
      <form
        className="unlock-modal startup-guide"
        onSubmit={createPassword}
        role="dialog"
        aria-modal="true"
        aria-labelledby="startup-guide-title"
      >
        <div className="modal-icon">
          <ShieldCheck size={24} />
        </div>
        <h2 id="startup-guide-title">Welcome to Skully</h2>
        <p>Create an administrator password and choose your kiosk theme.</p>
        <label>
          <span>Password</span>
          <input
            required
            minLength={8}
            autoComplete="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          <span>Repeat password</span>
          <input
            required
            minLength={8}
            autoComplete="new-password"
            type="password"
            value={repeatPassword}
            onChange={(event) => setRepeatPassword(event.target.value)}
          />
        </label>
        <fieldset className="startup-theme-selector">
          <legend>Theme</legend>
          {(["forest", "slate", "sunset"] as Theme[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`startup-theme theme-${value} ${
                theme === value ? "selected" : ""
              }`}
              onClick={() => setTheme(value)}
              aria-pressed={theme === value}
            >
              <span className="theme-preview" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {value}
            </button>
          ))}
        </fieldset>
        {error && <div className="startup-error">{error}</div>}
        <div className="startup-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void onSkip()}
          >
            Skip for now
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Setting up..." : "Create password"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EmailTemplateModal({
  subject,
  message,
  onSave,
  onClose,
}: {
  subject: string;
  message: string;
  onSave: (subject: string, message: string) => Promise<void>;
  onClose: () => void;
}) {
  const [subjectDraft, setSubjectDraft] = useState(
    subject || "Visitor sign-in: @visitorName",
  );
  const [messageDraft, setMessageDraft] = useState(
    message ||
      "Hello @teacher,\n\n@visitorName has arrived for a visit.\n\nReason: @reason\nOffice: @office\nSchool: @school\nSigned in: @dateTime",
  );
  const [saving, setSaving] = useState(false);
  const backdrop = useBackdropDismiss(onClose);
  const commands = [
    ["@visitorName", "Visitor full name"],
    ["@visitorFirstName", "Visitor first name"],
    ["@visitorLastName", "Visitor last name"],
    ["@teacher", "Teacher name"],
    ["@reason", "Visit reason"],
    ["@school", "School name"],
    ["@office", "Office name"],
    ["@date", "Current date"],
    ["@time", "Current time"],
    ["@dateTime", "Date and time"],
  ];

  return (
    <div className="modal-backdrop" role="presentation" {...backdrop}>
      <form
        className="unlock-modal email-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-template-title"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await onSave(subjectDraft, messageDraft);
          } finally {
            setSaving(false);
          }
        }}
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="modal-icon">
          <PencilLine size={24} />
        </div>
        <h2 id="email-template-title">Custom email message</h2>
        <p>Customize the notification sent when a visitor signs in.</p>
        <label>
          <span>Subject</span>
          <input
            required
            value={subjectDraft}
            onChange={(event) => setSubjectDraft(event.target.value)}
          />
        </label>
        <label>
          <span>Message</span>
          <textarea
            required
            rows={7}
            value={messageDraft}
            onChange={(event) => setMessageDraft(event.target.value)}
          />
        </label>
        <div className="email-command-list">
          <strong>Available commands</strong>
          <div>
            {commands.map(([command, description]) => (
              <button
                key={command}
                type="button"
                onClick={() =>
                  setMessageDraft((current) => `${current}${command}`)
                }
                title={description}
              >
                {command}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving..." : "Save message"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Logo() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <Skull size={23} strokeWidth={1.8} />
      </div>
      <div>
        <strong className="brand-name">Skully</strong>
        <span>Visitor sign-in sheet</span>
      </div>
    </div>
  );
}

function SignInPage({
  schoolName,
  teachers,
  reasons,
  onNotice,
  locked,
}: {
  schoolName: string;
  teachers: Teacher[];
  reasons: string[];
  refreshTeachers: () => void;
  locked: boolean;
  onNotice: (message: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [reason, setReason] = useState("");
  const [complete, setComplete] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/sign-ins", {
        method: "POST",
        body: JSON.stringify({ firstName, lastName, teacherId, reason }),
      });
      setComplete(true);
      onNotice("Sign-in successful");
      setFirstName("");
      setLastName("");
      setTeacherId("");
      setReason("");
      setTimeout(() => setComplete(false), 3500);
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  return (
    <main className="page sign-in-page">
      <div className="welcome">
        <div className="school-label">{schoolName}</div>
        <h1>Welcome! Please sign in.</h1>
        <p>Tell us who you are and which teacher sent you.</p>
      </div>
      <form className="form-card sign-card" onSubmit={submit}>
        <div className="name-grid">
          <Field
            label="First name"
            value={firstName}
            setValue={setFirstName}
            autoComplete="given-name"
          />
          <Field
            label="Last name"
            value={lastName}
            setValue={setLastName}
            autoComplete="family-name"
          />
        </div>
        <label>
          <span>Teacher</span>
          <select
            required
            value={teacherId}
            onChange={(event) => setTeacherId(event.target.value)}
          >
            <option value="">Select a teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.first_name} {teacher.last_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Reason for visit</span>
          <select
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="">Choose a reason</option>
            {reasons.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit">
          {complete ? (
            <>
              <Check size={20} /> You're signed in
            </>
          ) : (
            "Sign in"
          )}
        </button>
        {locked && (
          <div className="kiosk-hint">
            <ShieldCheck size={15} /> Press ESC for administrator access
          </div>
        )}
      </form>
    </main>
  );
}

function Field({
  label,
  value,
  setValue,
  autoComplete,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoComplete={autoComplete}
      />
    </label>
  );
}

function SettingsPage({
  settings,
  passwordConfigured,
  refreshPasswordStatus,
  refreshStatus,
  teachers,
  refreshTeachers,
  refreshSettings,
  setManagementOpen,
  setEmailTemplateOpen,
  theme,
  setTheme,
  onNotice,
}: {
  settings: Record<string, string>;
  passwordConfigured: boolean;
  refreshPasswordStatus: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  teachers: Teacher[];
  refreshTeachers: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setManagementOpen: (open: boolean) => void;
  setEmailTemplateOpen: (open: boolean) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onNotice: (message: string) => void;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const [teacher, setTeacher] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [setupPassword, setSetupPassword] = useState("");
  const [setupRepeat, setSetupRepeat] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [infoSection, setInfoSection] = useState<string>("");
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [revealedTeacherId, setRevealedTeacherId] = useState<number | null>(
    null,
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingTeacherId, setSavingTeacherId] = useState<number | null>(null);
  const save = async () => {
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      await api("/settings", { method: "PUT", body: JSON.stringify(draft) });
      await Promise.all([refreshSettings(), refreshStatus()]);
      onNotice("Settings saved");
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };
  const addTeacher = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/teachers", { method: "POST", body: JSON.stringify(teacher) });
      setTeacher({ firstName: "", lastName: "", email: "" });
      await refreshTeachers();
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const saveTeacher = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingTeacher || savingTeacherId !== null) return;
    const firstName = (editingTeacher.first_name ?? "").trim();
    const lastName = (editingTeacher.last_name ?? "").trim();
    const email = (editingTeacher.email ?? "").trim();
    if (!firstName || !lastName) {
      onNotice("A first name and last name are required");
      return;
    }
    setSavingTeacherId(editingTeacher.id);
    try {
      await api(`/teachers/${editingTeacher.id}`, {
        method: "PUT",
        body: JSON.stringify({
          firstName,
          lastName,
          email,
        }),
      });
      setEditingTeacher(null);
      setRevealedTeacherId(null);
      await refreshTeachers().catch(() => undefined);
      onNotice("Teacher updated");
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setSavingTeacherId(null);
    }
  };
  const createPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (setupPassword !== setupRepeat) return onNotice("Passwords must match");
    try {
      await api("/auth/setup", {
        method: "POST",
        body: JSON.stringify({ password: setupPassword }),
      });
      await refreshPasswordStatus();
      setSetupPassword("");
      setSetupRepeat("");
      onNotice("Administrator password created");
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== repeatPassword) return onNotice("Passwords must match");
    try {
      await api("/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword,
          password: newPassword,
          repeatPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      onNotice("Password updated");
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const emergencyReset = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/reset", {
        method: "POST",
        body: JSON.stringify({ password: resetPassword }),
      });
      window.sessionStorage.setItem("skully-setup-required", "true");
      window.location.reload();
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  return (
    <main className="page settings-page">
      <div className="page-heading settings-page-heading">
        <div className="page-heading-icon">
          <SettingsIcon size={21} />
        </div>
        <div className="page-heading-copy">
          <h1>Settings</h1>
          <p>Manage this kiosk and your office.</p>
        </div>
      </div>
      {passwordConfigured && (
        <div className="management-card">
          <SettingsHeading
            id="directory-button"
            title="Teachers and visit reasons"
            active={infoSection}
            toggle={setInfoSection}
          />
          {infoSection === "directory-button" && (
            <div className="settings-info">
              Manage the teacher directory and the reasons visitors can choose
              from the sign-in form.
            </div>
          )}
          <button
            className="secondary-button management-button"
            type="button"
            onClick={() => setManagementOpen(true)}
          >
            Manage teachers and reasons
          </button>
        </div>
      )}
      <div className="form-card settings-card">
        <section className="theme-section">
          <SettingsHeading
            id="appearance"
            title="Appearance"
            active={infoSection}
            toggle={setInfoSection}
          />
          {infoSection === "appearance" && (
            <div className="settings-info">
              Choose the color theme for this kiosk. Your selection is saved on
              this device.
            </div>
          )}
          <div className="theme-selector" role="radiogroup" aria-label="Theme">
            {(
              [
                ["forest", "Forest", "Green and cream"],
                ["slate", "Slate", "Cool blue gray"],
                ["sunset", "Sunset", "Warm orange and purple"],
              ] as [Theme, string, string][]
            ).map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                className={`theme-option theme-${value} ${
                  theme === value ? "selected" : ""
                }`}
                role="radio"
                aria-checked={theme === value}
                onClick={() => setTheme(value)}
              >
                <span className="theme-preview" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                {theme === value && (
                  <span className="theme-selected-mark">
                    <Check size={14} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
        {!passwordConfigured && (
          <section>
            <SettingsHeading
              id="setup"
              title="Create administrator password"
              active={infoSection}
              toggle={setInfoSection}
            />
            {infoSection === "setup" && (
              <div className="settings-info">
                This password protects access to the kiosk administration. Use a
                unique password of at least 8 characters. Once created, it can
                be changed from Password settings.
              </div>
            )}
            <p className="section-copy">
              Create a password to activate Settings.
            </p>
            <form className="password-form" onSubmit={createPassword}>
              <label>
                <span>Password</span>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                />
              </label>
              <label>
                <span>Repeat password</span>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={setupRepeat}
                  onChange={(e) => setSetupRepeat(e.target.value)}
                />
              </label>
              <button className="primary-button" type="submit">
                Create password
              </button>
            </form>
          </section>
        )}
        {passwordConfigured && (
          <>
            <section className="inline-management-section">
              <SettingsHeading
                id="teachers"
                title="Teacher management"
                active={infoSection}
                toggle={setInfoSection}
              />
              {infoSection === "teachers" && (
                <div className="settings-info">
                  Add, edit, reveal, or remove teachers who may receive
                  visitors. Email addresses are optional.
                </div>
              )}
              <form className="inline-form" onSubmit={addTeacher}>
                <input
                  required
                  aria-label="First name"
                  placeholder="First name"
                  value={teacher.firstName}
                  onChange={(e) =>
                    setTeacher({ ...teacher, firstName: e.target.value })
                  }
                />
                <input
                  required
                  aria-label="Last name"
                  placeholder="Last name"
                  value={teacher.lastName}
                  onChange={(e) =>
                    setTeacher({ ...teacher, lastName: e.target.value })
                  }
                />
                <input
                  aria-label="Email"
                  placeholder="Email (optional)"
                  value={teacher.email}
                  onChange={(e) =>
                    setTeacher({ ...teacher, email: e.target.value })
                  }
                />
                <button className="secondary-button" type="submit">
                  Add
                </button>
              </form>
              <div className="teacher-list">
                {teachers.map((item, index) =>
                  editingTeacher?.id === item.id ? (
                    <form
                      className="teacher-row teacher-edit-row"
                      key={item.id}
                      onSubmit={saveTeacher}
                    >
                      <input
                        required
                        aria-label="Teacher first name"
                        value={editingTeacher.first_name}
                        onChange={(event) =>
                          setEditingTeacher({
                            ...editingTeacher,
                            first_name: event.target.value,
                          })
                        }
                      />
                      <input
                        required
                        aria-label="Teacher last name"
                        value={editingTeacher.last_name}
                        onChange={(event) =>
                          setEditingTeacher({
                            ...editingTeacher,
                            last_name: event.target.value,
                          })
                        }
                      />
                      <input
                        aria-label="Teacher email"
                        type="email"
                        placeholder="Email (optional)"
                        value={editingTeacher.email}
                        onChange={(event) =>
                          setEditingTeacher({
                            ...editingTeacher,
                            email: event.target.value,
                          })
                        }
                      />{" "}
                      <button
                        className="row-action save"
                        type="submit"
                        disabled={savingTeacherId === editingTeacher.id}
                      >
                        {savingTeacherId === editingTeacher.id
                          ? "Saving..."
                          : "Save"}
                      </button>
                      <button
                        className="row-action"
                        type="button"
                        disabled={savingTeacherId === editingTeacher.id}
                        onClick={() => setEditingTeacher(null)}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="teacher-row" key={item.id}>
                      <span className="teacher-name">
                        {item.first_name} {item.last_name}
                      </span>
                      <span className="teacher-email">
                        {item.email
                          ? revealedTeacherId === item.id
                            ? item.email
                            : "***"
                          : "No email"}
                      </span>
                      <div className="teacher-actions">
                        {item.email && (
                          <button
                            className="row-icon-button"
                            aria-label={`${revealedTeacherId === item.id ? "Hide" : "Reveal"} email for ${item.first_name}`}
                            title={`${revealedTeacherId === item.id ? "Hide" : "Reveal"} email`}
                            onClick={() =>
                              setRevealedTeacherId((current) =>
                                current === item.id ? null : item.id,
                              )
                            }
                          >
                            {revealedTeacherId === item.id ? (
                              <EyeOff size={17} />
                            ) : (
                              <Eye size={17} />
                            )}
                          </button>
                        )}
                        <button
                          className="row-icon-button"
                          aria-label={`Edit ${item.first_name}`}
                          title="Edit teacher"
                          onClick={() => {
                            setEditingTeacher({ ...item });
                            setRevealedTeacherId(null);
                          }}
                        >
                          <PencilLine size={17} />
                        </button>
                        <button
                          className="row-icon-button"
                          aria-label={`Remove ${item.first_name}`}
                          title="Remove teacher"
                          onClick={async () => {
                            await api(`/teachers/${item.id}`, {
                              method: "DELETE",
                            });
                            await refreshTeachers();
                          }}
                        >
                          <X size={17} />
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
            <section>
              <SettingsHeading
                id="email"
                title="Email settings"
                active={infoSection}
                toggle={setInfoSection}
              />
              {infoSection === "email" && (
                <div className="settings-info email-info">
                  <strong>SMTP sends visitor notifications by email.</strong>
                  <p>
                    <b>SMTP host</b> is your mail provider's server, such as{" "}
                    <code>smtp.office365.com</code> or{" "}
                    <code>smtp.gmail.com</code>. <b>SMTP port</b> is commonly
                    587 for STARTTLS or 465 for direct TLS.
                  </p>
                  <p>
                    <b>Username</b> and <b>password</b> are your mail server
                    credentials. For Gmail or Microsoft accounts, an app
                    password may be required instead of the normal account
                    password.
                  </p>
                  <p>
                    <b>From address</b> identifies the sender shown in email
                    clients. <b>Notification email</b> is the office mailbox
                    that receives each new sign-in. SMTP and notification email
                    must both be configured for delivery.
                  </p>
                </div>
              )}
              <div className="field-grid">
                <TextSetting
                  draft={draft}
                  setDraft={setDraft}
                  name="smtp_host"
                  label="SMTP host"
                />
                <TextSetting
                  draft={draft}
                  setDraft={setDraft}
                  name="smtp_port"
                  label="SMTP port"
                />
                <TextSetting
                  draft={draft}
                  setDraft={setDraft}
                  name="notification_email"
                  label="Notification email"
                />
                <TextSetting
                  draft={draft}
                  setDraft={setDraft}
                  name="mail_from"
                  label="From address"
                />
                <TextSetting
                  draft={draft}
                  setDraft={setDraft}
                  name="smtp_user"
                  label="SMTP username"
                />
                <TextSetting
                  draft={draft}
                  setDraft={setDraft}
                  name="smtp_pass"
                  label="SMTP password"
                  password
                />
              </div>
              <button
                className="secondary-button email-template-button"
                type="button"
                onClick={() => setEmailTemplateOpen(true)}
              >
                <PencilLine size={17} />
                <span>Edit email message</span>
              </button>
            </section>
            <section>
              <SettingsHeading
                id="password"
                title="Password settings"
                active={infoSection}
                toggle={setInfoSection}
              />
              {infoSection === "password" && (
                <div className="settings-info">
                  Changing the administrator password requires the current
                  password and two matching entries for the new password. All
                  new passwords must contain at least 8 characters.
                </div>
              )}
              <form className="password-change" onSubmit={changePassword}>
                <label>
                  <span>Current password</span>
                  <input
                    required
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
                <label>
                  <span>New password</span>
                  <input
                    required
                    minLength={8}
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <label>
                  <span>Repeat password</span>
                  <input
                    required
                    minLength={8}
                    type="password"
                    value={repeatPassword}
                    onChange={(e) => setRepeatPassword(e.target.value)}
                  />
                </label>
                <button className="secondary-button" type="submit">
                  Update password
                </button>
              </form>
            </section>
            <section>
              <SettingsHeading
                id="school"
                title="School settings"
                active={infoSection}
                toggle={setInfoSection}
              />
              {infoSection === "school" && (
                <div className="settings-info">
                  School name appears on the visitor sign-in screen. Office name
                  identifies the receiving office in settings and can be used to
                  distinguish kiosks.
                </div>
              )}
              <div className="field-grid">
                <TextSetting
                  draft={draft}
                  setDraft={setDraft}
                  name="school_name"
                  label="School name"
                />
                <TextSetting
                  draft={draft}
                  setDraft={setDraft}
                  name="office_name"
                  label="Office name"
                />
              </div>
            </section>
            <div className="settings-actions">
              <button
                className="primary-button"
                type="button"
                onClick={save}
                disabled={savingSettings}
              >
                {savingSettings ? "Saving..." : "Save settings"}
              </button>
            </div>
          </>
        )}
      </div>
      {passwordConfigured && (
        <div className="danger-section danger-card">
          <div>
            <SettingsHeading
              id="reset"
              title="Emergency reset"
              active={infoSection}
              toggle={setInfoSection}
            />
            {infoSection === "reset" && (
              <div className="settings-info danger-info">
                This action permanently deletes every visitor record, teacher,
                school setting, and administrator password. You must enter the
                current password to continue.
              </div>
            )}
            <p>
              Permanently erase all sign-ins, teachers, settings, and the
              administrator password.
            </p>
          </div>
          <button className="danger-button" onClick={() => setResetOpen(true)}>
            <RotateCcw size={17} /> Emergency reset
          </button>
        </div>
      )}
      <div className="project-credit">A Skully Project</div>
      {resetOpen && (
        <ResetModal
          password={resetPassword}
          setPassword={setResetPassword}
          onSubmit={emergencyReset}
          onCancel={() => {
            setResetOpen(false);
            setResetPassword("");
          }}
        />
      )}
    </main>
  );
}

function DirectoryModal({
  settings,
  teachers,
  refreshTeachers,
  refreshSettings,
  refreshStatus,
  onNotice,
  onClose,
}: {
  settings: Record<string, string>;
  teachers: Teacher[];
  refreshTeachers: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  onNotice: (message: string) => void;
  onClose: () => void;
}) {
  const backdrop = useBackdropDismiss(onClose);
  const defaults = [
    "Class visit",
    "Meeting",
    "Delivery",
    "Appointment",
    "Other",
  ];
  const parseReasons = (value?: string) => {
    try {
      const parsed = JSON.parse(value || "");
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // Fall back to the standard reasons for older settings.
    }
    return defaults;
  };
  const [teacher, setTeacher] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [reasonsDraft, setReasonsDraft] = useState<string[]>(
    parseReasons(settings.visit_reasons),
  );
  const [reasonDraft, setReasonDraft] = useState("");
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [draggedTeacherId, setDraggedTeacherId] = useState<number | null>(null);
  const [draggedReason, setDraggedReason] = useState<string | null>(null);
  const [dragOverTeacherId, setDragOverTeacherId] = useState<number | null>(
    null,
  );
  const [dragOverReason, setDragOverReason] = useState<string | null>(null);
  const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= items.length ||
      toIndex >= items.length
    )
      return items;
    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    return reordered;
  };
  const dropTeacher = async (targetId: number) => {
    if (draggedTeacherId === null || draggedTeacherId === targetId) return;
    const fromIndex = teachers.findIndex(
      (item) => item.id === draggedTeacherId,
    );
    const toIndex = teachers.findIndex((item) => item.id === targetId);
    const reordered = moveItem(teachers, fromIndex, toIndex);
    await api("/teachers/order", {
      method: "PUT",
      body: JSON.stringify({ ids: reordered.map((item) => item.id) }),
    });
    await refreshTeachers();
  };
  const dropReason = (targetReason: string) => {
    if (!draggedReason || draggedReason === targetReason) return;
    setReasonsDraft((current) =>
      moveItem(
        current,
        current.indexOf(draggedReason),
        current.indexOf(targetReason),
      ),
    );
  };

  const saveReasons = async () => {
    if (reasonsDraft.length === 0)
      return onNotice("Add at least one visit reason");
    try {
      await api("/settings", {
        method: "PUT",
        body: JSON.stringify({ visit_reasons: JSON.stringify(reasonsDraft) }),
      });
      await Promise.all([refreshSettings(), refreshStatus()]);
      onNotice("Visit reasons updated");
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const addReason = () => {
    const reason = reasonDraft.trim();
    if (
      !reason ||
      reasonsDraft.some((item) => item.toLowerCase() === reason.toLowerCase())
    )
      return;
    setReasonsDraft((current) => [...current, reason]);
    setReasonDraft("");
  };
  const addTeacher = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/teachers", { method: "POST", body: JSON.stringify(teacher) });
      setTeacher({ firstName: "", lastName: "", email: "" });
      await refreshTeachers();
      onNotice("Teacher added");
    } catch (error) {
      onNotice((error as Error).message);
    }
  };
  const saveTeacher = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingTeacher) return;
    const firstName = editingTeacher.first_name.trim();
    const lastName = editingTeacher.last_name.trim();
    if (!firstName || !lastName)
      return onNotice("A first name and last name are required");
    try {
      await api(`/teachers/${editingTeacher.id}`, {
        method: "PUT",
        body: JSON.stringify({
          firstName,
          lastName,
          email: editingTeacher.email.trim(),
        }),
      });
      setEditingTeacher(null);
      await refreshTeachers();
      onNotice("Teacher updated");
    } catch (error) {
      onNotice((error as Error).message);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" {...backdrop}>
      <div
        className="directory-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="directory-title"
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="modal-icon">
          <ClipboardList size={24} />
        </div>
        <h2 id="directory-title">Teachers and visit reasons</h2>
        <p>Update the choices available on the visitor sign-in form.</p>
        <div className="directory-modal-grid">
          <section>
            <h3>Teachers</h3>
            <form className="directory-add-form" onSubmit={addTeacher}>
              <input
                required
                aria-label="First name"
                placeholder="First name"
                value={teacher.firstName}
                onChange={(event) =>
                  setTeacher({ ...teacher, firstName: event.target.value })
                }
              />
              <input
                required
                aria-label="Last name"
                placeholder="Last name"
                value={teacher.lastName}
                onChange={(event) =>
                  setTeacher({ ...teacher, lastName: event.target.value })
                }
              />
              <input
                aria-label="Email"
                type="email"
                placeholder="Email (optional)"
                value={teacher.email}
                onChange={(event) =>
                  setTeacher({ ...teacher, email: event.target.value })
                }
              />
              <button className="secondary-button" type="submit">
                Add teacher
              </button>
            </form>
            <div
              className={`directory-list ${
                draggedTeacherId !== null ? "is-sorting" : ""
              }`}
            >
              {teachers.map((item, index) =>
                editingTeacher?.id === item.id ? (
                  <form
                    className="directory-edit-row"
                    key={item.id}
                    onSubmit={saveTeacher}
                  >
                    <input
                      required
                      aria-label="Teacher first name"
                      value={editingTeacher.first_name}
                      onChange={(event) =>
                        setEditingTeacher({
                          ...editingTeacher,
                          first_name: event.target.value,
                        })
                      }
                    />
                    <input
                      required
                      aria-label="Teacher last name"
                      value={editingTeacher.last_name}
                      onChange={(event) =>
                        setEditingTeacher({
                          ...editingTeacher,
                          last_name: event.target.value,
                        })
                      }
                    />
                    <input
                      aria-label="Teacher email"
                      type="email"
                      value={editingTeacher.email}
                      onChange={(event) =>
                        setEditingTeacher({
                          ...editingTeacher,
                          email: event.target.value,
                        })
                      }
                    />
                    <button className="row-action save" type="submit">
                      Save
                    </button>
                    <button
                      className="row-action"
                      type="button"
                      onClick={() => setEditingTeacher(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div
                    className={`directory-list-row reorderable-row ${
                      draggedTeacherId === item.id ? "is-dragging" : ""
                    } ${
                      dragOverTeacherId === item.id &&
                      draggedTeacherId !== item.id
                        ? "is-drop-target"
                        : ""
                    }`}
                    key={item.id}
                    data-teacher-id={item.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverTeacherId(item.id);
                    }}
                    onDragLeave={() => setDragOverTeacherId(null)}
                    onDrop={(event) => {
                      event.preventDefault();
                      void dropTeacher(item.id);
                      setDraggedTeacherId(null);
                      setDragOverTeacherId(null);
                    }}
                  >
                    <span>
                      <strong>
                        {item.first_name} {item.last_name}
                      </strong>
                      <small>{item.email || "No email"}</small>
                    </span>
                    <div className="directory-row-actions">
                      <button
                        type="button"
                        className="row-icon-button"
                        draggable
                        aria-label={`Drag to reorder ${item.first_name}`}
                        title="Drag to reorder"
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          setDraggedTeacherId(item.id);
                        }}
                        onDragEnd={() => {
                          setDraggedTeacherId(null);
                          setDragOverTeacherId(null);
                        }}
                        onPointerDown={(event) => {
                          if (event.pointerType === "touch") {
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                            setDraggedTeacherId(item.id);
                          }
                        }}
                        onPointerMove={(event) => {
                          if (event.pointerType === "touch")
                            event.preventDefault();
                        }}
                        onPointerUp={(event) => {
                          if (event.pointerType !== "touch") return;
                          const target = document
                            .elementFromPoint(event.clientX, event.clientY)
                            ?.closest<HTMLElement>("[data-teacher-id]");
                          if (target) {
                            void dropTeacher(Number(target.dataset.teacherId));
                          }
                          setDraggedTeacherId(null);
                          setDragOverTeacherId(null);
                        }}
                      >
                        <MoveVertical size={18} strokeWidth={2.25} />
                      </button>
                      <button
                        type="button"
                        className="row-icon-button"
                        aria-label={`Edit ${item.first_name}`}
                        title="Edit teacher"
                        onClick={() => setEditingTeacher({ ...item })}
                      >
                        <PencilLine size={17} />
                      </button>
                      <button
                        type="button"
                        className="row-icon-button"
                        aria-label={`Remove ${item.first_name}`}
                        title="Remove teacher"
                        onClick={async () => {
                          await api(`/teachers/${item.id}`, {
                            method: "DELETE",
                          });
                          await refreshTeachers();
                        }}
                      >
                        <X size={17} />
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </section>
          <section>
            <h3>Visit reasons</h3>
            <div className="directory-add-form reason-add-form">
              <input
                aria-label="New visit reason"
                placeholder="Add a reason"
                value={reasonDraft}
                onChange={(event) => setReasonDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addReason();
                  }
                }}
              />
              <button
                className="secondary-button"
                type="button"
                onClick={addReason}
              >
                Add
              </button>
            </div>
            <div
              className={`directory-list ${
                draggedReason !== null ? "is-sorting" : ""
              }`}
            >
              {reasonsDraft.map((item, index) => (
                <div
                  className={`directory-list-row reorderable-row ${
                    draggedReason === item ? "is-dragging" : ""
                  } ${
                    dragOverReason === item && draggedReason !== item
                      ? "is-drop-target"
                      : ""
                  }`}
                  key={item}
                  data-reason={item}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverReason(item);
                  }}
                  onDragLeave={() => setDragOverReason(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropReason(item);
                    setDraggedReason(null);
                    setDragOverReason(null);
                  }}
                >
                  <span>
                    <strong>{item}</strong>
                  </span>
                  <div className="directory-row-actions">
                    <button
                      type="button"
                      className="row-icon-button"
                      draggable
                      aria-label={`Drag to reorder ${item}`}
                      title="Drag to reorder"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDraggedReason(item);
                      }}
                      onDragEnd={() => {
                        setDraggedReason(null);
                        setDragOverReason(null);
                      }}
                      onPointerDown={(event) => {
                        if (event.pointerType === "touch") {
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          setDraggedReason(item);
                        }
                      }}
                      onPointerMove={(event) => {
                        if (event.pointerType === "touch")
                          event.preventDefault();
                      }}
                      onPointerUp={(event) => {
                        if (event.pointerType !== "touch") return;
                        const target = document
                          .elementFromPoint(event.clientX, event.clientY)
                          ?.closest<HTMLElement>("[data-reason]");
                        if (target) dropReason(target.dataset.reason || "");
                        setDraggedReason(null);
                        setDragOverReason(null);
                      }}
                    >
                      <MoveVertical size={18} strokeWidth={2.25} />
                    </button>
                    <button
                      type="button"
                      className="row-icon-button"
                      aria-label={`Remove ${item}`}
                      title="Remove reason"
                      onClick={() =>
                        setReasonsDraft((current) =>
                          current.filter(
                            (_, reasonIndex) => reasonIndex !== index,
                          ),
                        )
                      }
                    >
                      <X size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="primary-button directory-save"
              type="button"
              onClick={saveReasons}
            >
              Save visit reasons
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function SettingsHeading({
  id,
  title,
  active,
  toggle,
}: {
  id: string;
  title: string;
  active: string;
  toggle: (value: string) => void;
}) {
  const expanded = active === id;
  return (
    <div className="settings-heading-row">
      <h2>{title}</h2>
      <button
        type="button"
        className={`info-button ${expanded ? "active" : ""}`}
        aria-label={`About ${title}`}
        aria-expanded={expanded}
        title={`About ${title}`}
        onClick={() => toggle(expanded ? "" : id)}
      >
        <CircleHelp size={18} />
      </button>
    </div>
  );
}

function DevToolsModal({
  theme,
  setTheme,
  onReset,
  onClose,
  onNotice,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onReset: (password: string) => Promise<void>;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const backdrop = useBackdropDismiss(onClose);

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setGenerating(true);
    try {
      const result = await api("/dev/temporary-password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setTemporaryPassword(result.password);
      setPassword("");
      onNotice("One-time password generated for 15 minutes");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const reset = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setResetting(true);
    try {
      await onReset(resetPassword);
    } catch (caught) {
      setError((caught as Error).message);
      setResetting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" {...backdrop}>
      <section
        className="unlock-modal dev-tools-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dev-tools-title"
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="modal-icon">
          <SlidersHorizontal size={24} />
        </div>
        <h2 id="dev-tools-title">Developer tools</h2>
        <p>Temporary administrator access and kiosk recovery tools.</p>

        <div className="dev-tools-section">
          <h3>One-time password</h3>
          <form onSubmit={generate}>
            <label>
              <span>Actual administrator password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="primary-button" type="submit" disabled={generating}>
              {generating ? "Generating..." : "Generate one-time password"}
            </button>
          </form>
          {temporaryPassword && (
            <div className="temporary-password-result">
              <span>Use at the administrator unlock screen</span>
              <strong>{temporaryPassword}</strong>
              <small>Valid once for 15 minutes</small>
            </div>
          )}
        </div>

        <div className="dev-tools-section">
          <h3>Theme</h3>
          <div className="dev-theme-list">
            {(["forest", "slate", "sunset"] as Theme[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`theme-option theme-${value} ${theme === value ? "selected" : ""}`}
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="dev-tools-section dev-tools-danger">
          <h3>Total data reset</h3>
          {!confirmReset ? (
            <button
              className="danger-button"
              type="button"
              onClick={() => setConfirmReset(true)}
            >
              Reset all kiosk data
            </button>
          ) : (
            <form onSubmit={reset}>
              <label>
                <span>Actual administrator password</span>
                <input
                  autoFocus
                  type="password"
                  required
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </button>
                <button className="danger-button" type="submit" disabled={resetting}>
                  {resetting ? "Resetting..." : "Permanently reset"}
                </button>
              </div>
            </form>
          )}
        </div>
        {error && <div className="form-error dev-tools-error">{error}</div>}
        <div className="project-credit dev-project-credit">A Skully Project</div>
      </section>
    </div>
  );
}

function ResetModal({
  password,
  setPassword,
  onSubmit,
  onCancel,
}: {
  password: string;
  setPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  const backdrop = useBackdropDismiss(onCancel);
  return (
    <div className="modal-backdrop" role="presentation" {...backdrop}>
      <form
        className="unlock-modal reset-modal"
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onCancel}
        >
          <X size={19} />
        </button>
        <div className="modal-icon danger-icon">
          <TriangleAlert size={24} />
        </div>
        <h2 id="reset-title">Emergency reset</h2>
        <p>
          This permanently deletes all visitors, teachers, settings, and the
          administrator password. This cannot be undone.
        </p>
        <label>
          <span>Administrator password</span>
          <input
            autoFocus
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger-button modal-reset" type="submit">
            Reset everything
          </button>
        </div>
      </form>
    </div>
  );
}

function TextSetting({
  draft,
  setDraft,
  name,
  label,
  password,
  valueOverride,
  onValueOverride,
}: {
  draft: Record<string, string>;
  setDraft: (draft: Record<string, string>) => void;
  name: string;
  label: string;
  password?: boolean;
  valueOverride?: string;
  onValueOverride?: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type={password ? "password" : "text"}
        placeholder={password ? "Not stored in this view" : ""}
        value={valueOverride ?? draft[name] ?? ""}
        onChange={(e) =>
          onValueOverride
            ? onValueOverride(e.target.value)
            : setDraft({ ...draft, [name]: e.target.value })
        }
      />
    </label>
  );
}

function LogsPage({
  logs,
  refreshLogs,
}: {
  logs: SignIn[];
  refreshLogs: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sortNewest, setSortNewest] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const filtered = logs
    .filter(
      (row) =>
        `${row.first_name} ${row.last_name} ${row.teacher_first} ${row.teacher_last} ${row.reason}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (status === "all" || row.email_status === status),
    )
    .sort((a, b) =>
      sortNewest
        ? b.created_at.localeCompare(a.created_at)
        : a.created_at.localeCompare(b.created_at),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleLogs = filtered.slice(
    safePageIndex * 10,
    safePageIndex * 10 + 10,
  );
  useEffect(() => setPageIndex(0), [query, status, sortNewest]);
  return (
    <main className="page logs-page">
      <div className="page-heading logs-page-heading">
        <div className="page-heading-copy">
          <h1>Logs</h1>
          <p>{logs.length} recent visits · showing 10 per page</p>
        </div>
        <button
          className="refresh-button"
          type="button"
          onClick={() => void refreshLogs()}
          title="Refresh logs"
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>
      <div className="log-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            placeholder="Search sign-ins"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter email status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All email statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="not_sent">Not sent</option>
        </select>
        <button
          className="secondary-button"
          onClick={() => setSortNewest(!sortNewest)}
        >
          Date: {sortNewest ? "Newest" : "Oldest"}
        </button>
      </div>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Student</th>
              <th>Teacher</th>
              <th>Reason</th>
              <th>Email status</th>
            </tr>
          </thead>
          <tbody>
            {visibleLogs.map((row) => (
              <tr key={row.id}>
                <td>
                  {new Date(row.created_at).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </td>
                <td>
                  {row.first_name} {row.last_name}
                </td>
                <td>
                  {row.teacher_first} {row.teacher_last}
                </td>
                <td>{row.reason}</td>
                <td>
                  <span className={`status status-${row.email_status}`}>
                    {row.email_status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty">No sign-ins found.</div>
        )}
      </div>
      {filtered.length > 0 && (
        <div className="pagination">
          <button
            className="icon-button"
            aria-label="Previous page"
            disabled={safePageIndex === 0}
            onClick={() => setPageIndex(safePageIndex - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            Page {safePageIndex + 1} of {pageCount}
          </span>
          <button
            className="icon-button"
            aria-label="Next page"
            disabled={safePageIndex >= pageCount - 1}
            onClick={() => setPageIndex(safePageIndex + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </main>
  );
}

function UnlockModal({
  configured,
  password,
  setPassword,
  onSubmit,
  onCancel,
}: {
  configured: boolean;
  password: string;
  setPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
}) {
  const backdrop = useBackdropDismiss(onCancel);
  return (
    <div className="modal-backdrop" role="presentation" {...backdrop}>
      <form
        className="unlock-modal"
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-title"
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Close"
          onClick={onCancel}
        >
          <X size={19} />
        </button>
        <div className="modal-icon">
          <LockKeyhole size={24} />
        </div>
        <h2 id="unlock-title">Administrator access</h2>
        <p>
          {configured
            ? "Enter your administrator password to unlock the kiosk."
            : "Enter the default administrator password to unlock the kiosk."}
        </p>
        <label>
          <span>Password</span>
          <input
            autoFocus
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}
