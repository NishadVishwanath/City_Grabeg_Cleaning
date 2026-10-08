import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API = "/api";
const statuses = ["Reported", "In progress", "Resolved"];
const ADMIN_PAGE_SIZE = 50;
const statusClass = (status) => status.toLowerCase().replaceAll(" ", "-");

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    camera: <><path d="M14 5H9L7 8H4v12h16V8h-3l-2-3Z" /><circle cx="12" cy="14" r="3.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    leaf: <><path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 8-8 8-16Z" /><path d="M4 21c3-6 7-9 12-12" /></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
}

function ReportCard({ report }) {
  return (
    <article className="report-card">
      <div className="report-photo">
        {report.image_url ? <img src={report.image_url} alt={`Garbage reported in ${report.area}`} /> : <div className="photo-placeholder"><Icon name="image" size={28} /><span>Photo unavailable</span></div>}
        <span className={`status-pill ${statusClass(report.status)}`}><i />{report.status}</span>
      </div>
      <div className="report-content">
        <div className="report-meta"><span><Icon name="pin" size={15} />{report.area}</span><span>{formatDate(report.reported_at)}</span></div>
        <p>{report.description}</p>
        <div className="report-id">REPORT #{String(report.id).slice(0, 8).toUpperCase()}</div>
      </div>
    </article>
  );
}

function App() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const imageInput = useRef(null);
  const [preview, setPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminReports, setAdminReports] = useState([]);
  const [adminError, setAdminError] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminPage, setAdminPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState("All reports");
  const [form, setForm] = useState({ description: "", area: "", reported_at: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), contact_name: "", contact_email: "", contact_phone: "" });

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/reports`);
      if (!response.ok) throw new Error("Couldn't load reports. Please try again shortly.");
      setReports(await response.json());
    } catch (err) {
      setError(err.message || "The reporting service is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const counts = useMemo(() => ({
    total: reports.length,
    inProgress: reports.filter((report) => report.status === "In progress").length,
    resolved: reports.filter((report) => report.status === "Resolved").length,
  }), [reports]);
  const filteredReports = useMemo(() => reports.filter((report) => activeFilter === "All reports" || report.status === activeFilter), [reports, activeFilter]);
  const adminPageCount = Math.max(1, Math.ceil(adminReports.length / ADMIN_PAGE_SIZE));
  const visibleAdminReports = adminReports.slice((adminPage - 1) * ADMIN_PAGE_SIZE, adminPage * ADMIN_PAGE_SIZE);

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!file) {
      setError("Choose a JPG, PNG, or WEBP photo before submitting.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => data.append(key, value));
      data.append("image", file);
      const response = await fetch(`${API}/reports`, { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Your report couldn't be submitted.");
      setMessage("Your report is on its way. Thanks for looking out for your neighborhood.");
      setForm((current) => ({ ...current, description: "", area: "", contact_name: "", contact_email: "", contact_phone: "" }));
      setFile(null);
      if (imageInput.current) imageInput.current.value = "";
      await loadReports();
    } catch (err) {
      setError(err.message || "The reporting service is unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadAdminReports(token = adminToken) {
    setAdminBusy(true);
    setAdminError("");
    try {
      const response = await fetch(`${API}/admin/reports`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          sessionStorage.removeItem("cleancity_admin_token");
          setAdminToken("");
        }
        throw new Error(body.detail || "Admin access could not be verified.");
      }
      setAdminToken(token);
      sessionStorage.setItem("cleancity_admin_token", token);
      setAdminReports(body);
      setAdminPage(1);
    } catch (err) {
      setAdminError(err.message || "Couldn't load the admin dashboard.");
    } finally {
      setAdminBusy(false);
    }
  }

  useEffect(() => {
    const token = sessionStorage.getItem("cleancity_admin_token");
    if (token && adminOpen) { setAdminToken(token); loadAdminReports(token); }
  }, [adminOpen]);

  async function signInAdmin(event) {
    event.preventDefault();
    setAdminBusy(true);
    setAdminError("");
    try {
      const response = await fetch(`${API}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Couldn't sign in.");
      setAdminPassword("");
      await loadAdminReports(body.access_token);
    } catch (err) {
      setAdminError(err.message || "Couldn't sign in.");
    } finally {
      setAdminBusy(false);
    }
  }

  async function changeStatus(reportId, status) {
    setAdminError("");
    try {
      const response = await fetch(`${API}/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Couldn't update report status.");
      setAdminReports((items) => items.map((item) => item.id === reportId ? body : item));
      await loadReports();
    } catch (err) {
      setAdminError(err.message || "Couldn't update report status.");
    }
  }

  async function deleteReport(reportId) {
    if (!window.confirm("Permanently delete this report and its uploaded image?")) return;
    setAdminError("");
    try {
      const response = await fetch(`${API}/admin/reports/${reportId}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail || "Couldn't delete this report.");
      }
      setAdminReports((items) => items.filter((item) => item.id !== reportId));
      await loadReports();
    } catch (err) {
      setAdminError(err.message || "Couldn't delete this report.");
    }
  }

  function signOut() {
    sessionStorage.removeItem("cleancity_admin_token");
    setAdminToken("");
    setAdminReports([]);
    setAdminError("");
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CleanCity home"><span className="brand-icon"><Icon name="leaf" size={21} /></span><span>clean<span className="brand-light">city</span><small>YOUR CITY. YOUR SAY.</small></span></a>
        <nav className="desktop-nav"><a href="#how-it-works">How it works</a><a href="#reports">Community reports</a></nav>
        <button className="admin-link" onClick={() => { setAdminOpen(true); setAdminError(""); }}><Icon name="lock" size={16} /> Admin</button>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span />A CLEANER CITY STARTS WITH US</div>
            <h1>See it.<br />Report it.<br /><em>Clean it up.</em></h1>
            <p>Spotted waste where it shouldn't be? Let your city know. Together, we can make every street feel like home.</p>
            <a className="primary-button hero-button" href="#report"><span>Report an issue</span><Icon name="arrow" size={18} /></a>
            <div className="hero-proof"><div className="avatar-stack"><span>J</span><span>M</span><span>A</span><span>+</span></div><span><strong>Neighbors are making a difference</strong><small>One report, one cleaner street at a time.</small></span></div>
          </div>
          <div className="hero-art">
            <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
            <div className="sun-disc" />
            <div className="city-scene">
              <div className="skyline building-one"><span /><span /><span /><span /><span /><span /></div>
              <div className="skyline building-two"><span /><span /><span /><span /><span /><span /></div>
              <div className="skyline building-three"><span /><span /><span /><span /><span /><span /></div>
              <div className="tree tree-one"><i /><b /></div><div className="tree tree-two"><i /><b /></div>
              <div className="horizon" />
              <div className="path" />
              <div className="report-marker"><Icon name="pin" size={24} /><span>Cleaner blocks start here</span></div>
              <div className="hero-stat"><div className="stat-icon"><Icon name="check" size={16} /></div><span><b>{counts.resolved}</b><small>spots cleaned up</small></span></div>
            </div>
            <div className="art-caption"><span>01 / TAKE ACTION</span><span>Make your neighborhood matter.</span></div>
          </div>
        </section>

        <section className="impact-strip" aria-label="Community impact">
          <div className="impact-intro"><span className="live-dot" />OUR COMMUNITY IN ACTION</div>
          <div className="impact-item"><strong>{counts.total.toLocaleString()}</strong><span>reports made</span></div>
          <div className="impact-item"><strong>{counts.inProgress.toLocaleString()}</strong><span>being tackled</span></div>
          <div className="impact-item"><strong>{counts.resolved.toLocaleString()}</strong><span>spots cleaned up</span></div>
          <div className="impact-note"><Icon name="leaf" size={18} /><span>Small acts. <b>Cleaner city.</b></span></div>
        </section>

        <section className="content-grid" id="report">
          <div className="section-intro">
            <div className="eyebrow"><span />YOUR EYES MAKE A DIFFERENCE</div>
            <h2>Notice something?<br /><em>Say something.</em></h2>
            <p>It takes less than a minute to flag a dumping site, overflowing bin, or littered street. No account needed.</p>
            <div className="steps" id="how-it-works">
              <div className="step"><span className="step-number">01</span><span><b>Snap a photo</b><small>Show us what's happening.</small></span><Icon name="camera" size={19} /></div>
              <div className="step"><span className="step-number">02</span><span><b>Pin the place</b><small>Tell us where to look.</small></span><Icon name="pin" size={19} /></div>
              <div className="step"><span className="step-number">03</span><span><b>We'll take it from here</b><small>Follow the update together.</small></span><Icon name="arrow" size={19} /></div>
            </div>
            <div className="privacy-note"><span><Icon name="lock" size={15} /></span><p><b>Your privacy matters.</b><br />No account or password required. Contact details are optional and only shared with city administrators.</p></div>
          </div>

          <form className="report-form" onSubmit={submitReport}>
            <div className="form-heading"><div><span className="eyebrow">MAKE A DIFFERENCE</span><h3>Report a spot</h3></div><span className="form-index">01 — 03</span></div>
            <label className="upload-zone" htmlFor="image-upload">
              {preview ? <img className="upload-preview" src={preview} alt="Selected garbage report" /> : <><span className="upload-icon"><Icon name="camera" size={22} /></span><span className="upload-title">Drop a photo here, or <u>browse</u></span><span className="upload-hint">JPG, PNG or WEBP · Up to 8 MB</span></>}
              {preview && <span className="replace-photo">Change photo</span>}
              <input ref={imageInput} id="image-upload" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                const selected = event.target.files?.[0] || null;
                if (selected && !["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
                  setError("Choose a JPG, PNG, or WEBP photo.");
                  event.target.value = "";
                  setFile(null);
                } else if (selected && selected.size > 8 * 1024 * 1024) {
                  setError("Choose a photo that is 8 MB or smaller.");
                  event.target.value = "";
                  setFile(null);
                } else {
                  setError("");
                  setFile(selected);
                }
              }} required />
            </label>
            <label className="field-label" htmlFor="description">WHAT'S GOING ON? <span>*</span></label>
            <textarea id="description" name="description" value={form.description} onChange={updateForm} placeholder="Tell us about the waste or dumping..." maxLength={1200} required />
            <div className="field-row">
              <div className="field-wrap"><label className="field-label" htmlFor="area">WHERE IS IT? <span>*</span></label><div className="input-with-icon"><Icon name="pin" size={17} /><input id="area" name="area" value={form.area} onChange={updateForm} placeholder="Street, area or landmark" maxLength={200} required /></div></div>
              <div className="field-wrap"><label className="field-label" htmlFor="reported_at">WHEN DID YOU SEE IT? <span>*</span></label><div className="input-with-icon"><Icon name="clock" size={17} /><input id="reported_at" name="reported_at" type="datetime-local" value={form.reported_at} onChange={updateForm} required /></div></div>
            </div>
            <details className="contact-details"><summary>Leave contact details <span>optional</span></summary><div className="contact-grid"><div className="field-wrap"><label className="field-label" htmlFor="contact_name">YOUR NAME</label><input className="plain-input" id="contact_name" name="contact_name" value={form.contact_name} onChange={updateForm} maxLength={120} autoComplete="name" placeholder="Name" /></div><div className="field-wrap"><label className="field-label" htmlFor="contact_phone">PHONE</label><input className="plain-input" id="contact_phone" name="contact_phone" value={form.contact_phone} onChange={updateForm} maxLength={40} autoComplete="tel" placeholder="Phone number" /></div><div className="field-wrap contact-email"><label className="field-label" htmlFor="contact_email">EMAIL</label><input className="plain-input" id="contact_email" name="contact_email" type="email" value={form.contact_email} onChange={updateForm} maxLength={254} autoComplete="email" placeholder="Email address" /></div></div></details>
            {error && !adminOpen && <div className="form-alert error" role="alert">{error}</div>}
            {message && <div className="form-alert success" role="status"><Icon name="check" size={17} />{message}</div>}
            <button className="primary-button submit-button" disabled={submitting}>{submitting ? "Sending your report…" : "Send your report"}<Icon name="arrow" size={18} /></button>
            <p className="form-footnote">By submitting, you're helping make our shared spaces better.</p>
          </form>
        </section>

        <section className="reports-section" id="reports">
          <div className="reports-heading">
            <div><div className="eyebrow"><span />AROUND YOUR NEIGHBORHOOD</div><h2>What's happening <em>near you.</em></h2><p>Every report is a step toward a cleaner block.</p></div>
            <div className="filter-tabs" role="group" aria-label="Filter reports">
              {["All reports", ...statuses].map((filter) => <button key={filter} className={activeFilter === filter ? "active" : ""} onClick={() => setActiveFilter(filter)}>{filter}<span>{filter === "All reports" ? reports.length : reports.filter((report) => report.status === filter).length}</span></button>)}
            </div>
          </div>
          {error && <div className="inline-alert" role="alert">{error}<button onClick={loadReports}>Try again</button></div>}
          <div className="report-grid">
            {loading && <div className="empty-state">Finding community reports…</div>}
            {!loading && filteredReports.map((report) => <ReportCard key={report.id} report={report} />)}
            {!loading && !filteredReports.length && <div className="empty-state"><span className="empty-icon"><Icon name="leaf" size={26} /></span><b>Nothing to show just yet.</b><span>{reports.length ? "Try another status filter." : "Be the first to report an issue in your community."}</span><a href="#report">Make the first report <Icon name="arrow" size={15} /></a></div>}
          </div>
        </section>
      </main>

      <footer className="footer"><a className="brand footer-brand" href="#top"><span className="brand-icon"><Icon name="leaf" size={19} /></span><span>clean<span className="brand-light">city</span><small>YOUR CITY. YOUR SAY.</small></span></a><span>A little care goes a long way.</span><a href="#top">BACK TO TOP ↑</a></footer>

      {adminOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdminOpen(false); }}><section className="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-title">
        <div className="admin-top"><span className="admin-lock"><Icon name="lock" size={18} /></span><button className="icon-button" aria-label="Close admin panel" onClick={() => setAdminOpen(false)}><Icon name="close" /></button></div>
        {!adminToken ? <form className="admin-login" onSubmit={signInAdmin}>
          <span className="eyebrow">CITY OPERATIONS</span><h2 id="admin-title">Admin sign in</h2><p>Manage community reports and follow up with residents.</p>
          <label className="field-label" htmlFor="admin-username">USER ID</label><input className="plain-input" id="admin-username" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" placeholder="Enter admin user ID" required />
          <label className="field-label admin-password-label" htmlFor="admin-password">PASSWORD</label><input className="plain-input" id="admin-password" type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" placeholder="Enter admin password" required />
          {adminError && <div className="form-alert error" role="alert">{adminError}</div>}<button className="primary-button submit-button" disabled={adminBusy}>{adminBusy ? "Checking…" : "Open dashboard"}<Icon name="arrow" size={18} /></button>
          <span className="login-footnote">Your password is never stored in the browser.</span>
        </form> : <div className="admin-dashboard">
          <div className="admin-title-row"><div><span className="eyebrow">CITY OPERATIONS</span><h2 id="admin-title">Report desk</h2></div><button className="signout-button" onClick={signOut}>Sign out</button></div>
          {adminError && <div className="form-alert error" role="alert">{adminError}</div>}
          <div className="admin-summary"><span><b>{adminReports.length}</b> total reports</span><span><b>{adminReports.filter((r) => r.status === "Reported").length}</b> need attention</span></div>
          {adminBusy && <div className="empty-state">Loading reports…</div>}
          {!adminBusy && !adminReports.length && <div className="empty-state admin-empty">No reports to manage yet.</div>}
          <div className="admin-list">{visibleAdminReports.map((report) => <article className="admin-report" key={report.id}>
            {report.image_url && <img src={report.image_url} alt="" />}
            <div className="admin-report-info"><div className="admin-report-heading"><b>{report.area}</b><span>{formatDate(report.reported_at)}</span></div><p>{report.description}</p>
              <div className="admin-contact"><span><b>Reported by</b> {report.contact_name || "Anonymous"}</span><span><b>Email</b> {report.contact_email || "—"}</span><span><b>Phone</b> {report.contact_phone || "—"}</span></div>
              <div className="admin-actions"><label className="sr-only" htmlFor={`status-${report.id}`}>Status for {report.area}</label><select id={`status-${report.id}`} value={report.status} onChange={(event) => changeStatus(report.id, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select><button onClick={() => deleteReport(report.id)} aria-label={`Delete report from ${report.area}`}><Icon name="trash" size={16} /> Delete report</button></div>
            </div>
          </article>)}</div>
          {!adminBusy && adminReports.length > ADMIN_PAGE_SIZE && <div className="admin-pagination"><span>Showing {(adminPage - 1) * ADMIN_PAGE_SIZE + 1}–{Math.min(adminPage * ADMIN_PAGE_SIZE, adminReports.length)} of {adminReports.length} reports</span><div><button disabled={adminPage === 1} onClick={() => setAdminPage((page) => page - 1)}>Previous</button><b>{adminPage} / {adminPageCount}</b><button disabled={adminPage === adminPageCount} onClick={() => setAdminPage((page) => page + 1)}>Next</button></div></div>}
        </div>}
      </section></div>}
    </>
  );
}

export default App;
