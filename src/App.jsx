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

function AdminWorkspace({ view, onNavigate, onExit, reports, busy, error, page, pageCount, visibleReports, onPageChange, onStatusChange, onDelete }) {
  const analytics = useMemo(() => {
    const byStatus = Object.fromEntries(statuses.map((status) => [status, reports.filter((report) => report.status === status).length]));
    const currentMonth = new Date();
    const monthPoints = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return {
        key,
        label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date),
        count: reports.filter((report) => {
          const observed = new Date(report.reported_at);
          return `${observed.getFullYear()}-${String(observed.getMonth() + 1).padStart(2, "0")}` === key;
        }).length,
      };
    });
    const areaCounts = new Map();
    reports.forEach((report) => areaCounts.set(report.area, (areaCounts.get(report.area) || 0) + 1));
    const topAreas = [...areaCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const resolved = byStatus.Resolved;
    const maxMonthly = Math.max(1, ...monthPoints.map((point) => point.count));
    const maxArea = Math.max(1, ...topAreas.map(([, count]) => count));
    const points = monthPoints.map((point, index) => `${40 + index * 164},${178 - (point.count / maxMonthly) * 142}`).join(" ");
    const contacts = reports.filter((report) => report.contact_name || report.contact_email || report.contact_phone).length;
    return {
      byStatus,
      monthPoints,
      topAreas,
      resolved,
      maxMonthly,
      maxArea,
      points,
      contacts,
      resolutionRate: reports.length ? Math.round((resolved / reports.length) * 100) : 0,
    };
  }, [reports]);

  return (
    <div className="admin-workspace">
      <aside className="admin-sidebar">
        <a className="brand admin-brand" href="/" onClick={(event) => { event.preventDefault(); onExit(); }}><span className="brand-icon"><Icon name="leaf" size={21} /></span><span>clean<span className="brand-light">city</span><small>CITY OPERATIONS</small></span></a>
        <div className="sidebar-label">WORKSPACE</div>
        <button className={`sidebar-link ${view === "dashboard" ? "selected" : ""}`} onClick={() => onNavigate("dashboard")}><span>▦</span> Report desk</button>
        <button className={`sidebar-link ${view === "analytics" ? "selected" : ""}`} onClick={() => onNavigate("analytics")}><span>▤</span> Data analytics</button>
        <div className="sidebar-spacer" />
        <button className="sidebar-link public-link" onClick={onExit}><span>↗</span> Public website</button>
        <div className="sidebar-user"><span className="user-avatar">A</span><span><b>City administrator</b><small>Operations</small></span><button aria-label="Sign out" onClick={onExit}>↗</button></div>
      </aside>
      <main className="admin-main">
        <header className="admin-header"><div><span>City operations</span><b>/</b><strong>{view === "analytics" ? "Data analytics" : "Report desk"}</strong></div><button className="admin-view-site" onClick={onExit}>View public site <Icon name="arrow" size={15} /></button></header>
        <div className="admin-page-content">
          {error && <div className="form-alert error" role="alert">{error}</div>}
          {view === "dashboard" ? <>
            <div className="admin-page-heading"><div><span className="eyebrow"><span />LIVE COMMUNITY OPERATIONS</span><h1>Report desk</h1><p>Review incoming reports and coordinate a cleaner city.</p></div><button className="analytics-shortcut" onClick={() => onNavigate("analytics")}>View analytics <Icon name="arrow" size={16} /></button></div>
            <div className="admin-kpi-grid">
              <article className="admin-kpi"><span>Total reports</span><b>{reports.length.toLocaleString()}</b><small>Community submissions</small><i className="kpi-symbol">▤</i></article>
              <article className="admin-kpi"><span>Needs attention</span><b>{analytics.byStatus.Reported.toLocaleString()}</b><small>Awaiting city action</small><i className="kpi-symbol warm">◷</i></article>
              <article className="admin-kpi"><span>In progress</span><b>{analytics.byStatus["In progress"].toLocaleString()}</b><small>Currently being handled</small><i className="kpi-symbol blue">↗</i></article>
              <article className="admin-kpi"><span>Resolved</span><b>{analytics.resolved.toLocaleString()}</b><small>{analytics.resolutionRate}% of all reports</small><i className="kpi-symbol">✓</i></article>
            </div>
            <section className="admin-card dashboard-reports">
              <div className="admin-card-heading"><div><h2>Recent reports</h2><p>Update the status or review resident contact details.</p></div><button onClick={() => onNavigate("analytics")}>Analytics overview <Icon name="arrow" size={14} /></button></div>
              {busy && <div className="admin-empty-state">Loading reports…</div>}
              {!busy && !reports.length && <div className="admin-empty-state">No reports to manage yet.</div>}
              <div className="admin-list">{visibleReports.map((report) => <article className="admin-report" key={report.id}>
                {report.image_url && <img src={report.image_url} alt="" />}
                <div className="admin-report-info"><div className="admin-report-heading"><b>{report.area}</b><span>{formatDate(report.reported_at)}</span></div><p>{report.description}</p>
                  <div className="admin-contact"><span><b>Reported by</b> {report.contact_name || "Anonymous"}</span><span><b>Email</b> {report.contact_email || "—"}</span><span><b>Phone</b> {report.contact_phone || "—"}</span></div>
                  <div className="admin-actions"><label className="sr-only" htmlFor={`status-${report.id}`}>Status for {report.area}</label><select id={`status-${report.id}`} value={report.status} onChange={(event) => onStatusChange(report.id, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select><button onClick={() => onDelete(report.id)} aria-label={`Delete report from ${report.area}`}><Icon name="trash" size={16} /> Delete report</button></div>
                </div>
              </article>)}</div>
              {!busy && reports.length > ADMIN_PAGE_SIZE && <div className="admin-pagination"><span>Showing {(page - 1) * ADMIN_PAGE_SIZE + 1}–{Math.min(page * ADMIN_PAGE_SIZE, reports.length)} of {reports.length}</span><div><button disabled={page === 1} onClick={() => onPageChange(page - 1)}>Previous</button><b>{page} / {pageCount}</b><button disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>Next</button></div></div>}
            </section>
          </> : <>
            <div className="admin-page-heading"><div><span className="eyebrow"><span />COMMUNITY IMPACT OVERVIEW</span><h1>Data analytics</h1><p>Understand reporting trends and where cleanup support is needed.</p></div><span className="analytics-range">Based on {reports.length.toLocaleString()} reports</span></div>
            <div className="admin-kpi-grid analytics-kpis">
              <article className="admin-kpi"><span>Reports received</span><b>{reports.length.toLocaleString()}</b><small>Across all neighborhoods</small><i className="kpi-symbol">▤</i></article>
              <article className="admin-kpi"><span>Resolution rate</span><b>{analytics.resolutionRate}%</b><small>{analytics.resolved.toLocaleString()} reports resolved</small><i className="kpi-symbol">✓</i></article>
              <article className="admin-kpi"><span>Open reports</span><b>{(analytics.byStatus.Reported + analytics.byStatus["In progress"]).toLocaleString()}</b><small>Reported or in progress</small><i className="kpi-symbol warm">◷</i></article>
              <article className="admin-kpi"><span>Residents reachable</span><b>{analytics.contacts.toLocaleString()}</b><small>Included contact details</small><i className="kpi-symbol blue">♙</i></article>
            </div>
            <div className="analytics-grid">
              <section className="admin-card trend-card"><div className="admin-card-heading"><div><h2>Reports over time</h2><p>Reports by observation month · last six months</p></div><span className="chart-legend"><i /> Reports</span></div>
                <div className="trend-chart"><div className="chart-y-labels"><span>{analytics.maxMonthly}</span><span>{Math.round(analytics.maxMonthly / 2)}</span><span>0</span></div><svg viewBox="0 0 860 210" preserveAspectRatio="none" role="img" aria-label="Monthly reports trend"><defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#82aa70" stopOpacity=".26" /><stop offset="100%" stopColor="#82aa70" stopOpacity="0" /></linearGradient></defs><path d={`M ${analytics.points.replaceAll(" ", " L ")} L 860 190 L 40 190 Z`} fill="url(#trendFill)" /><polyline points={analytics.points} fill="none" stroke="#568252" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{analytics.monthPoints.map((point, index) => { const [x, y] = analytics.points.split(" ")[index].split(","); return <g key={point.key}><circle cx={x} cy={y} r="4" fill="#fff" stroke="#568252" strokeWidth="2" /><title>{point.label}: {point.count} reports</title></g>; })}</svg></div>
                <div className="chart-x-labels">{analytics.monthPoints.map((point) => <span key={point.key}>{point.label}</span>)}</div>
              </section>
              <section className="admin-card status-card"><div className="admin-card-heading"><div><h2>Report status</h2><p>Current workload breakdown</p></div></div>
                {statuses.map((status) => { const count = analytics.byStatus[status]; const percent = reports.length ? Math.round((count / reports.length) * 100) : 0; return <div className="status-breakdown" key={status}><div><span><i className={`status-dot ${statusClass(status)}`} />{status}</span><b>{count.toLocaleString()} <small>{percent}%</small></b></div><div className="status-track"><i className={statusClass(status)} style={{ width: `${percent}%` }} /></div></div>; })}
                <div className="resolution-note"><span>✓</span><p><b>{analytics.resolutionRate}% resolved</b><br />of all community reports</p></div>
              </section>
              <section className="admin-card areas-card"><div className="admin-card-heading"><div><h2>Most reported areas</h2><p>Neighborhoods with the most cleanup reports</p></div><Icon name="pin" size={18} /></div>
                {!analytics.topAreas.length && <div className="admin-empty-state">Area analytics will appear when reports arrive.</div>}
                {analytics.topAreas.map(([area, count], index) => <div className="area-row" key={area}><span className="area-rank">{String(index + 1).padStart(2, "0")}</span><span className="area-name">{area}<i><b style={{ width: `${(count / analytics.maxArea) * 100}%` }} /></i></span><strong>{count}</strong></div>)}
              </section>
              <section className="admin-card insights-card"><span className="insights-icon"><Icon name="leaf" size={19} /></span><span className="eyebrow">COMMUNITY SNAPSHOT</span><h2>Your city is showing up.</h2><p>{analytics.resolved.toLocaleString()} reports resolved so far. {analytics.byStatus.Reported.toLocaleString()} newly reported spots are waiting for a first response.</p><button onClick={() => onNavigate("dashboard")}>Go to report desk <Icon name="arrow" size={15} /></button></section>
            </div>
          </>}
        </div>
      </main>
    </div>
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
  const [adminView, setAdminView] = useState("public");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminReports, setAdminReports] = useState([]);
  const [adminError, setAdminError] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminPage, setAdminPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState("All reports");
  const [form, setForm] = useState({ description: "", area: "", reported_at: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), contact_name: "", contact_email: "", contact_phone: "" });

  function navigateAdmin(view) {
    const path = view === "public" ? "/" : view === "analytics" ? "/admin/analytics" : "/admin";
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setAdminView(view);
    setAdminOpen(false);
    window.scrollTo(0, 0);
  }

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
    const token = sessionStorage.getItem("cleancity_admin_token");
    const path = window.location.pathname;
    if (token && path.startsWith("/admin")) {
      setAdminToken(token);
      setAdminView(path === "/admin/analytics" ? "analytics" : "dashboard");
      loadAdminReports(token);
    } else if (path.startsWith("/admin")) {
      setAdminOpen(true);
      window.history.replaceState({}, "", "/");
    }
    const syncRoute = () => {
      const nextPath = window.location.pathname;
      const nextToken = sessionStorage.getItem("cleancity_admin_token");
      if (nextPath.startsWith("/admin") && nextToken) {
        setAdminToken(nextToken);
        setAdminView(nextPath === "/admin/analytics" ? "analytics" : "dashboard");
        loadAdminReports(nextToken);
      } else if (nextPath.startsWith("/admin")) {
        setAdminOpen(true);
        window.history.replaceState({}, "", "/");
      } else {
        setAdminView("public");
        setAdminOpen(false);
      }
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);
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
          if (window.location.pathname.startsWith("/admin")) {
            navigateAdmin("public");
            setAdminOpen(true);
          }
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
      setAdminToken(body.access_token);
      sessionStorage.setItem("cleancity_admin_token", body.access_token);
      navigateAdmin("dashboard");
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
    navigateAdmin("public");
  }

  function openAdmin() {
    setAdminError("");
    const token = sessionStorage.getItem("cleancity_admin_token");
    if (token) {
      setAdminToken(token);
      loadAdminReports(token);
      navigateAdmin("dashboard");
    } else {
      setAdminOpen(true);
    }
  }

  return (
    <>
      {adminToken && adminView !== "public" ? <AdminWorkspace
        view={adminView}
        onNavigate={navigateAdmin}
        onExit={signOut}
        reports={adminReports}
        busy={adminBusy}
        error={adminError}
        page={adminPage}
        pageCount={adminPageCount}
        visibleReports={visibleAdminReports}
        onPageChange={setAdminPage}
        onStatusChange={changeStatus}
        onDelete={deleteReport}
      /> : <>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CleanCity home"><span className="brand-icon"><Icon name="leaf" size={21} /></span><span>clean<span className="brand-light">city</span><small>YOUR CITY. YOUR SAY.</small></span></a>
        <nav className="desktop-nav"><a href="#how-it-works">How it works</a><a href="#reports">Community reports</a></nav>
        <button className="admin-link" onClick={openAdmin}><Icon name="lock" size={16} /> Admin</button>
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
      </>}

      {adminOpen && !adminToken && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdminOpen(false); }}><section className="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-title">
        <div className="admin-top"><span className="admin-lock"><Icon name="lock" size={18} /></span><button className="icon-button" aria-label="Close admin panel" onClick={() => setAdminOpen(false)}><Icon name="close" /></button></div>
        {!adminToken ? <form className="admin-login" onSubmit={signInAdmin}>
          <span className="eyebrow">CITY OPERATIONS</span><h2 id="admin-title">Admin sign in</h2><p>Manage community reports and follow up with residents.</p>
          <label className="field-label" htmlFor="admin-username">USER ID</label><input className="plain-input" id="admin-username" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" placeholder="Enter admin user ID" required />
          <label className="field-label admin-password-label" htmlFor="admin-password">PASSWORD</label><input className="plain-input" id="admin-password" type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} autoComplete="current-password" placeholder="Enter admin password" required />
          {adminError && <div className="form-alert error" role="alert">{adminError}</div>}<button className="primary-button submit-button" disabled={adminBusy}>{adminBusy ? "Checking…" : "Open dashboard"}<Icon name="arrow" size={18} /></button>
          <span className="login-footnote">Your password is never stored in the browser.</span>
        </form> : null}

      </section></div>}
    </>
  );
}

export default App;
