import { FormEvent, useEffect, useState } from 'react';
import { Binoculars, Check, ChevronLeft, ChevronRight, ClipboardList, CircleHelp, Eye, EyeOff, LockKeyhole, PencilLine, RotateCcw, Search, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';

type Page = 'sign-in' | 'settings' | 'logs';
type Teacher = { id: number; first_name: string; last_name: string; email: string };
type SignIn = { id: number; first_name: string; last_name: string; teacher_first: string; teacher_last: string; reason: string; email_status: string; created_at: string };

async function api(path: string, options?: RequestInit) {
  const response = await fetch(`/api${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export default function App() {
  const [page, setPage] = useState<Page>('sign-in');
  const [locked, setLocked] = useState(true);
  const [passwordConfigured, setPasswordConfigured] = useState(true);
  const [schoolName, setSchoolName] = useState('Lincoln High School');
  const [modal, setModal] = useState(false);
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [logs, setLogs] = useState<SignIn[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});

  const refreshStatus = async () => {
    const status = await api('/status');
    setLocked(status.locked); setPasswordConfigured(status.passwordConfigured); setSchoolName(status.schoolName);
  };
  const refreshTeachers = async () => setTeachers(await api('/teachers'));
  const refreshLogs = async () => setLogs(await api('/sign-ins'));
  const refreshSettings = async () => setSettings(await api('/settings'));

  useEffect(() => { refreshStatus().catch(() => undefined); refreshTeachers().catch(() => undefined); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (locked) setModal(current => !current);
        else setModal(false);
        return;
      }

      const target = event.target as HTMLElement;
      const isTyping = target.matches('input, textarea, select, [contenteditable="true"]');
      if (!isTyping && event.key.toLowerCase() === 'l' && !event.ctrlKey && !event.metaKey && !event.altKey && !locked) {
        event.preventDefault();
        void api('/lock', { method: 'POST' }).then(() => { setLocked(true); setPage('sign-in'); });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked]);

  const navigate = (next: Page) => { setPage(next); if (next === 'logs') refreshLogs().catch(error => setNotice(error.message)); if (next === 'settings') refreshSettings().catch(error => setNotice(error.message)); };
  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api('/auth/unlock', { method: 'POST', body: JSON.stringify({ password }) });
      setPassword(''); setModal(false); setLocked(false); await refreshStatus(); await refreshTeachers();
    } catch (error) { setNotice((error as Error).message); }
  };
  const lock = async () => { await api('/lock', { method: 'POST' }); setLocked(true); setPage('sign-in'); };

  return <div className="app-shell">
    <header className="topbar">
      <Logo />
      <nav className={`nav-pill ${locked ? 'nav-hidden' : ''}`} aria-label="Primary navigation">
        <button className={page === 'sign-in' ? 'active' : ''} onClick={() => navigate('sign-in')}><PencilLine size={17} /> Sign in</button>
        {!locked && <><button className={page === 'logs' ? 'active' : ''} onClick={() => navigate('logs')}><ClipboardList size={17} /> Logs</button><button className={page === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><SlidersHorizontal size={17} /> Settings</button></>}
      </nav>
      {!locked && <button className="lock-button" onClick={lock} title="Lock kiosk (L)"><LockKeyhole size={18} /> Lock <kbd>L</kbd></button>}
      {locked && <button className="lock-button lock-key" onClick={() => setModal(true)} title="Administrator unlock"><LockKeyhole size={18} /></button>}
    </header>

    {page === 'sign-in' && <SignInPage schoolName={schoolName} teachers={teachers} refreshTeachers={refreshTeachers} locked={locked} onNotice={setNotice} />}
    {!locked && page === 'settings' && <SettingsPage settings={settings} passwordConfigured={passwordConfigured} refreshPasswordStatus={refreshStatus} refreshStatus={refreshStatus} teachers={teachers} refreshTeachers={refreshTeachers} refreshSettings={refreshSettings} onNotice={setNotice} />}
    {!locked && page === 'logs' && <LogsPage logs={logs} refreshLogs={refreshLogs} />}

    {notice && <div className="toast" role="status"><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {modal && <UnlockModal configured={passwordConfigured} password={password} setPassword={setPassword} onSubmit={unlock} onCancel={() => { setModal(false); setPassword(''); setNotice(''); }} />}
  </div>;
}

function Logo() {
  return <div className="brand"><div className="brand-mark"><PencilLine size={21} strokeWidth={2.3} /></div><div><strong className="brand-name">Sc<span className="wordmark-icon" aria-hidden="true"><Binoculars /></span>pely</strong><span>Visitor sign-in sheet</span></div></div>;
}

function SignInPage({ schoolName, teachers, onNotice, locked }: { schoolName: string; teachers: Teacher[]; refreshTeachers: () => void; locked: boolean; onNotice: (message: string) => void }) {
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState(''); const [teacherId, setTeacherId] = useState(''); const [reason, setReason] = useState(''); const [complete, setComplete] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); try { await api('/sign-ins', { method: 'POST', body: JSON.stringify({ firstName, lastName, teacherId, reason }) }); setComplete(true); setFirstName(''); setLastName(''); setTeacherId(''); setReason(''); setTimeout(() => setComplete(false), 3500); } catch (error) { onNotice((error as Error).message); } };
  return <main className="page sign-in-page">
    <div className="welcome"><div className="school-label">{schoolName}</div><h1>Welcome! Please sign in.</h1><p>Tell us who you are and which teacher sent you.</p></div>
    <form className="form-card sign-card" onSubmit={submit}>
      <div className="name-grid"><Field label="First name" value={firstName} setValue={setFirstName} autoComplete="given-name" /><Field label="Last name" value={lastName} setValue={setLastName} autoComplete="family-name" /></div>
      <label><span>Teacher</span><select required value={teacherId} onChange={event => setTeacherId(event.target.value)}><option value="">Select a teacher</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.first_name} {teacher.last_name}</option>)}</select></label>
      <label><span>Reason for visit</span><select required value={reason} onChange={event => setReason(event.target.value)}><option value="">Choose a reason</option><option>Class visit</option><option>Meeting</option><option>Delivery</option><option>Appointment</option><option>Other</option></select></label>
      <button className="primary-button" type="submit">{complete ? <><Check size={20} /> You're signed in</> : 'Sign in'}</button>
      {locked && <div className="kiosk-hint"><ShieldCheck size={15} /> Press ESC for administrator access</div>}
    </form>
  </main>;
}

function Field({ label, value, setValue, autoComplete }: { label: string; value: string; setValue: (value: string) => void; autoComplete?: string }) {
  return <label><span>{label}</span><input required value={value} onChange={event => setValue(event.target.value)} autoComplete={autoComplete} /></label>;
}

function SettingsPage({ settings, passwordConfigured, refreshPasswordStatus, refreshStatus, teachers, refreshTeachers, refreshSettings, onNotice }: { settings: Record<string, string>; passwordConfigured: boolean; refreshPasswordStatus: () => Promise<void>; refreshStatus: () => Promise<void>; teachers: Teacher[]; refreshTeachers: () => Promise<void>; refreshSettings: () => Promise<void>; onNotice: (message: string) => void }) {
  const [draft, setDraft] = useState(settings); useEffect(() => setDraft(settings), [settings]);
  const [teacher, setTeacher] = useState({ firstName: '', lastName: '', email: '' });
  const [setupPassword, setSetupPassword] = useState(''); const [setupRepeat, setSetupRepeat] = useState('');
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [repeatPassword, setRepeatPassword] = useState('');
  const [resetOpen, setResetOpen] = useState(false); const [resetPassword, setResetPassword] = useState('');
  const [infoSection, setInfoSection] = useState<string>('');
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [revealedTeacherId, setRevealedTeacherId] = useState<number | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingTeacherId, setSavingTeacherId] = useState<number | null>(null);
  const save = async () => { if (savingSettings) return; setSavingSettings(true); try { await api('/settings', { method: 'PUT', body: JSON.stringify(draft) }); await Promise.all([refreshSettings(), refreshStatus()]); onNotice('Settings saved'); } catch (error) { onNotice((error as Error).message); } finally { setSavingSettings(false); } };
  const addTeacher = async (event: FormEvent) => { event.preventDefault(); try { await api('/teachers', { method: 'POST', body: JSON.stringify(teacher) }); setTeacher({ firstName: '', lastName: '', email: '' }); await refreshTeachers(); } catch (error) { onNotice((error as Error).message); } };
  const saveTeacher = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingTeacher || savingTeacherId !== null) return;
    const firstName = (editingTeacher.first_name ?? '').trim();
    const lastName = (editingTeacher.last_name ?? '').trim();
    const email = (editingTeacher.email ?? '').trim();
    if (!firstName || !lastName) {
      onNotice('A first name and last name are required');
      return;
    }
    setSavingTeacherId(editingTeacher.id);
    try {
      await api(`/teachers/${editingTeacher.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName,
          lastName,
          email
        })
      });
      setEditingTeacher(null);
      setRevealedTeacherId(null);
      await refreshTeachers().catch(() => undefined);
      onNotice('Teacher updated');
    } catch (error) {
      onNotice((error as Error).message);
    } finally {
      setSavingTeacherId(null);
    }
  };
  const createPassword = async (event: FormEvent) => { event.preventDefault(); if (setupPassword !== setupRepeat) return onNotice('Passwords must match'); try { await api('/auth/setup', { method: 'POST', body: JSON.stringify({ password: setupPassword }) }); await refreshPasswordStatus(); setSetupPassword(''); setSetupRepeat(''); onNotice('Administrator password created'); } catch (error) { onNotice((error as Error).message); } };
  const changePassword = async (event: FormEvent) => { event.preventDefault(); if (newPassword !== repeatPassword) return onNotice('Passwords must match'); try { await api('/password', { method: 'PUT', body: JSON.stringify({ currentPassword, password: newPassword, repeatPassword }) }); setCurrentPassword(''); setNewPassword(''); setRepeatPassword(''); onNotice('Password updated'); } catch (error) { onNotice((error as Error).message); } };
  const emergencyReset = async (event: FormEvent) => { event.preventDefault(); try { await api('/reset', { method: 'POST', body: JSON.stringify({ password: resetPassword }) }); window.location.reload(); } catch (error) { onNotice((error as Error).message); } };
  return <main className="page settings-page"><div className="page-heading"><SettingsIcon size={22} /><div><h1>Settings</h1><p>Manage this kiosk and your office.</p></div></div><div className="form-card settings-card">
    {!passwordConfigured && <section><SettingsHeading id="setup" title="Create administrator password" active={infoSection} toggle={setInfoSection} />{infoSection === 'setup' && <div className="settings-info">This password protects access to the kiosk administration. Use a unique password of at least 8 characters. Once created, it can be changed from Password settings.</div>}<p className="section-copy">Create a password to activate Settings.</p><form className="password-form" onSubmit={createPassword}><label><span>Password</span><input required minLength={8} type="password" value={setupPassword} onChange={e => setSetupPassword(e.target.value)} /></label><label><span>Repeat password</span><input required minLength={8} type="password" value={setupRepeat} onChange={e => setSetupRepeat(e.target.value)} /></label><button className="primary-button" type="submit">Create password</button></form></section>}
    {passwordConfigured && <>
    <section><SettingsHeading id="teachers" title="Teacher management" active={infoSection} toggle={setInfoSection} />{infoSection === 'teachers' && <div className="settings-info">Add, edit, reveal, or remove teachers who may receive visitors. Email addresses are optional.</div>}<form className="inline-form" onSubmit={addTeacher}><input required aria-label="First name" placeholder="First name" value={teacher.firstName} onChange={e => setTeacher({ ...teacher, firstName: e.target.value })}/><input required aria-label="Last name" placeholder="Last name" value={teacher.lastName} onChange={e => setTeacher({ ...teacher, lastName: e.target.value })}/><input aria-label="Email" placeholder="Email (optional)" value={teacher.email} onChange={e => setTeacher({ ...teacher, email: e.target.value })}/><button className="secondary-button" type="submit">Add</button></form><div className="teacher-list">{teachers.map(item => editingTeacher?.id === item.id ? <form className="teacher-row teacher-edit-row" key={item.id} onSubmit={saveTeacher}><input required aria-label="Teacher first name" value={editingTeacher.first_name} onChange={event => setEditingTeacher({ ...editingTeacher, first_name: event.target.value })}/><input required aria-label="Teacher last name" value={editingTeacher.last_name} onChange={event => setEditingTeacher({ ...editingTeacher, last_name: event.target.value })}/><input aria-label="Teacher email" type="email" placeholder="Email (optional)" value={editingTeacher.email} onChange={event => setEditingTeacher({ ...editingTeacher, email: event.target.value })}/>    <button className="row-action save" type="submit" disabled={savingTeacherId === editingTeacher.id}>{savingTeacherId === editingTeacher.id ? 'Saving...' : 'Save'}</button><button className="row-action" type="button" disabled={savingTeacherId === editingTeacher.id} onClick={() => setEditingTeacher(null)}>Cancel</button></form> : <div className="teacher-row" key={item.id}><span className="teacher-name">{item.first_name} {item.last_name}</span><span className="teacher-email">{item.email ? revealedTeacherId === item.id ? item.email : '***' : 'No email'}</span><div className="teacher-actions">{item.email && <button className="row-icon-button" aria-label={`${revealedTeacherId === item.id ? 'Hide' : 'Reveal'} email for ${item.first_name}`} title={`${revealedTeacherId === item.id ? 'Hide' : 'Reveal'} email`} onClick={() => setRevealedTeacherId(current => current === item.id ? null : item.id)}>{revealedTeacherId === item.id ? <EyeOff size={17}/> : <Eye size={17}/>}</button>}<button className="row-icon-button" aria-label={`Edit ${item.first_name}`} title="Edit teacher" onClick={() => { setEditingTeacher({ ...item }); setRevealedTeacherId(null); }}><PencilLine size={17}/></button><button className="row-icon-button" aria-label={`Remove ${item.first_name}`} title="Remove teacher" onClick={async () => { await api(`/teachers/${item.id}`, { method: 'DELETE' }); await refreshTeachers(); }}><X size={17}/></button></div></div>)}</div></section>
    <section><SettingsHeading id="email" title="Email settings" active={infoSection} toggle={setInfoSection} />{infoSection === 'email' && <div className="settings-info email-info"><strong>SMTP sends visitor notifications by email.</strong><p><b>SMTP host</b> is your mail provider's server, such as <code>smtp.office365.com</code> or <code>smtp.gmail.com</code>. <b>SMTP port</b> is commonly 587 for STARTTLS or 465 for direct TLS.</p><p><b>Username</b> and <b>password</b> are your mail server credentials. For Gmail or Microsoft accounts, an app password may be required instead of the normal account password.</p><p><b>From address</b> identifies the sender shown in email clients. <b>Notification email</b> is the office mailbox that receives each new sign-in. SMTP and notification email must both be configured for delivery.</p></div>}<div className="field-grid"><TextSetting draft={draft} setDraft={setDraft} name="smtp_host" label="SMTP host"/><TextSetting draft={draft} setDraft={setDraft} name="smtp_port" label="SMTP port"/><TextSetting draft={draft} setDraft={setDraft} name="notification_email" label="Notification email"/><TextSetting draft={draft} setDraft={setDraft} name="mail_from" label="From address"/><TextSetting draft={draft} setDraft={setDraft} name="smtp_user" label="SMTP username"/><TextSetting draft={draft} setDraft={setDraft} name="smtp_pass" label="SMTP password" password/></div></section>
    <section><SettingsHeading id="password" title="Password settings" active={infoSection} toggle={setInfoSection} />{infoSection === 'password' && <div className="settings-info">Changing the administrator password requires the current password and two matching entries for the new password. All new passwords must contain at least 8 characters.</div>}<form className="password-change" onSubmit={changePassword}><label><span>Current password</span><input required type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label><label><span>New password</span><input required minLength={8} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label><label><span>Repeat password</span><input required minLength={8} type="password" value={repeatPassword} onChange={e => setRepeatPassword(e.target.value)} /></label><button className="secondary-button" type="submit">Update password</button></form></section>
    <section><SettingsHeading id="school" title="School settings" active={infoSection} toggle={setInfoSection} />{infoSection === 'school' && <div className="settings-info">School name appears on the visitor sign-in screen. Office name identifies the receiving office in settings and can be used to distinguish kiosks.</div>}<div className="field-grid"><TextSetting draft={draft} setDraft={setDraft} name="school_name" label="School name"/><TextSetting draft={draft} setDraft={setDraft} name="office_name" label="Office name"/></div></section>
    <div className="settings-actions"><button className="primary-button" type="button" onClick={save} disabled={savingSettings}>{savingSettings ? 'Saving...' : 'Save settings'}</button></div>
    </>}
  </div>
  {passwordConfigured && <div className="danger-section danger-card"><div><SettingsHeading id="reset" title="Emergency reset" active={infoSection} toggle={setInfoSection} />{infoSection === 'reset' && <div className="settings-info danger-info">This action permanently deletes every visitor record, teacher, school setting, and administrator password. You must enter the current password to continue.</div>}<p>Permanently erase all sign-ins, teachers, settings, and the administrator password.</p></div><button className="danger-button" onClick={() => setResetOpen(true)}><RotateCcw size={17} /> Emergency reset</button></div>}
  <div className="project-credit">A Scopely Project</div>
  {resetOpen && <ResetModal password={resetPassword} setPassword={setResetPassword} onSubmit={emergencyReset} onCancel={() => { setResetOpen(false); setResetPassword(''); }} />}
  </main>;
}

function SettingsHeading({ id, title, active, toggle }: { id: string; title: string; active: string; toggle: (value: string) => void }) {
  const expanded = active === id;
  return <div className="settings-heading-row"><h2>{title}</h2><button type="button" className={`info-button ${expanded ? 'active' : ''}`} aria-label={`About ${title}`} aria-expanded={expanded} title={`About ${title}`} onClick={() => toggle(expanded ? '' : id)}><CircleHelp size={18} /></button></div>;
}

function ResetModal({ password, setPassword, onSubmit, onCancel }: { password: string; setPassword: (value: string) => void; onSubmit: (event: FormEvent) => void; onCancel: () => void }) {
  return <div className="modal-backdrop" role="presentation"><form className="unlock-modal reset-modal" onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="reset-title"><button type="button" className="modal-close" aria-label="Close" onClick={onCancel}><X size={19} /></button><div className="modal-icon danger-icon"><TriangleAlert size={24} /></div><h2 id="reset-title">Emergency reset</h2><p>This permanently deletes all visitors, teachers, settings, and the administrator password. This cannot be undone.</p><label><span>Administrator password</span><input autoFocus required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="danger-button modal-reset" type="submit">Reset everything</button></div></form></div>;
}

function TextSetting({ draft, setDraft, name, label, password, valueOverride, onValueOverride }: { draft: Record<string, string>; setDraft: (draft: Record<string, string>) => void; name: string; label: string; password?: boolean; valueOverride?: string; onValueOverride?: (value: string) => void }) {
  return <label><span>{label}</span><input type={password ? 'password' : 'text'} placeholder={password ? 'Not stored in this view' : ''} value={valueOverride ?? draft[name] ?? ''} onChange={e => onValueOverride ? onValueOverride(e.target.value) : setDraft({ ...draft, [name]: e.target.value })}/></label>;
}

function LogsPage({ logs, refreshLogs }: { logs: SignIn[]; refreshLogs: () => Promise<void> }) {
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [sortNewest, setSortNewest] = useState(true); const [pageIndex, setPageIndex] = useState(0);
  const filtered = logs.filter(row => (`${row.first_name} ${row.last_name} ${row.teacher_first} ${row.teacher_last} ${row.reason}`).toLowerCase().includes(query.toLowerCase()) && (status === 'all' || row.email_status === status)).sort((a, b) => sortNewest ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleLogs = filtered.slice(safePageIndex * 10, safePageIndex * 10 + 10);
  useEffect(() => setPageIndex(0), [query, status, sortNewest]);
  return <main className="page logs-page"><div className="page-heading"><div><h1>Logs</h1><p>{logs.length} recent visits · showing 10 per page</p></div><button className="secondary-button" onClick={() => refreshLogs()}>Refresh</button></div><div className="log-toolbar"><label className="search"><Search size={18}/><input placeholder="Search sign-ins" value={query} onChange={e => setQuery(e.target.value)}/></label><select aria-label="Filter email status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All email statuses</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="not_sent">Not sent</option></select><button className="secondary-button" onClick={() => setSortNewest(!sortNewest)}>Date: {sortNewest ? 'Newest' : 'Oldest'}</button></div><div className="table-card"><table><thead><tr><th>Date</th><th>Student</th><th>Teacher</th><th>Reason</th><th>Email status</th></tr></thead><tbody>{visibleLogs.map(row => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{row.first_name} {row.last_name}</td><td>{row.teacher_first} {row.teacher_last}</td><td>{row.reason}</td><td><span className={`status status-${row.email_status}`}>{row.email_status.replace('_', ' ')}</span></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty">No sign-ins found.</div>}</div>{filtered.length > 0 && <div className="pagination"><button className="icon-button" aria-label="Previous page" disabled={safePageIndex === 0} onClick={() => setPageIndex(safePageIndex - 1)}><ChevronLeft size={18}/></button><span>Page {safePageIndex + 1} of {pageCount}</span><button className="icon-button" aria-label="Next page" disabled={safePageIndex >= pageCount - 1} onClick={() => setPageIndex(safePageIndex + 1)}><ChevronRight size={18}/></button></div>}</main>;
}

function UnlockModal({ configured, password, setPassword, onSubmit, onCancel }: { configured: boolean; password: string; setPassword: (value: string) => void; onSubmit: (event: FormEvent) => void; onCancel: () => void }) {
  return <div className="modal-backdrop" role="presentation"><form className="unlock-modal" onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="unlock-title"><button type="button" className="modal-close" aria-label="Close" onClick={onCancel}><X size={19}/></button><div className="modal-icon"><LockKeyhole size={24}/></div><h2 id="unlock-title">Administrator access</h2><p>{configured ? 'Enter your administrator password to unlock the kiosk.' : 'Enter the default administrator password to unlock the kiosk.'}</p><label><span>Password</span><input autoFocus required type="password" value={password} onChange={e => setPassword(e.target.value)} /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" type="submit">Unlock</button></div></form></div>;
}
