import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  ChartArea,
  CheckCircle2,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Siren,
  UserCircle2,
  Workflow,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiRequest, downloadCsv } from './lib/api';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoading />;
  return user ? children : <Navigate to="/login" replace />;
}

function PageLoading() {
  return <div className="grid min-h-screen place-items-center bg-slate-950 text-slate-200"><div className="h-12 w-12 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" /></div>;
}

function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    { label: 'Project Monitor', to: '/projects', icon: FolderKanban },
    { label: 'Monitoring', to: '/resources', icon: Workflow },
    { label: 'Alerts', to: '/alerts', icon: Bell },
    { label: 'Analytics', to: '/analytics', icon: ChartArea },
    { label: 'Reports', to: '/reports', icon: Activity },
    { label: 'Settings', to: '/settings', icon: ShieldCheck },
    { label: 'Profile', to: '/profile', icon: UserCircle2 },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-800 bg-slate-900/80 p-6 md:block">
          <div className="mb-10 flex items-center gap-3">
            <div className="rounded-xl bg-cyan-500/20 p-2 text-cyan-300"><ShieldCheck size={22} /></div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Sentinel</p>
              <h1 className="text-lg font-semibold text-white">Operations Console</h1>
            </div>
          </div>
          <nav className="space-y-2">
            {navItems.map(({ label, to, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-cyan-500/15 text-cyan-200 shadow-lg shadow-cyan-950/40' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                <Icon size={17} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400"><span>Account</span><span className="text-emerald-300">Signed in</span></div>
            <div className="mt-4 flex items-center gap-3 text-sm text-slate-300">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)]" />
              <span>{user?.name || 'Operator'}</span>
            </div>
          </div>
          <button onClick={handleLogout} className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700">
            <LogOut size={16} /> Logout
          </button>
        </aside>

        <main className="flex-1">
          <header className="border-b border-slate-800 bg-slate-900/80 px-4 py-4 backdrop-blur md:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Sentinel</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{navItems.find((item) => item.to === location.pathname)?.label || 'Overview'}</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300">{user?.email || 'demo@sentinel.local'}</div>
                <button onClick={handleLogout} className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-200 md:hidden"><LogOut size={16} /></button>
              </div>
            </div>
          </header>
          <div className="p-4 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint, tone = 'cyan', icon: Icon }) {
  const tones = {
    cyan: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    rose: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  };
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg shadow-slate-950/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
        </div>
        <div className={`rounded-xl border p-2 ${tones[tone]}`}><Icon size={18} /></div>
      </div>
      <p className="mt-3 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [dashboardData, reportData] = await Promise.all([
          apiRequest('/dashboard/summary'),
          apiRequest('/reports/summary?days=7'),
        ]);
        setSummary(dashboardData);
        setReport(reportData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <SectionSkeleton />;
  if (error) return <ErrorState message={error} />;

  const chartData = report?.trend || [];
  const hasMetricSamples = chartData.some((point) => point.responseTimeAvg !== null || point.errorRateAvg !== null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Overview</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Mission readiness dashboard</h3>
        </div>
        <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">{summary.demoMode ? 'Demo data' : 'MongoDB-backed'}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Monitored resources" value={summary.totalResources} hint="All active endpoints" tone="cyan" icon={Activity} />
        <StatCard label="Healthy" value={summary.healthyResources} hint="Within expected thresholds" tone="emerald" icon={CheckCircle2} />
        <StatCard label="Attention" value={summary.resourcesNeedingAttention} hint="Need review" tone="amber" icon={AlertTriangle} />
        <StatCard label="Critical alerts" value={summary.criticalAlerts} hint="Open high-severity incidents" tone="rose" icon={Siren} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-lg font-semibold text-white">Response and error trends</h4>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Last 7 days</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="at" tickFormatter={(value) => new Date(value).toLocaleDateString()} stroke="#94a3b8" />
                <YAxis yAxisId="response" stroke="#22d3ee" />
                <YAxis yAxisId="error" orientation="right" stroke="#fbbf24" />
                <Tooltip labelFormatter={(value) => new Date(value).toLocaleString()} />
                <Legend />
                <Line yAxisId="response" type="monotone" dataKey="responseTimeAvg" stroke="#22d3ee" strokeWidth={2} name="Response time (ms)" connectNulls={false} />
                <Line yAxisId="error" type="monotone" dataKey="errorRateAvg" stroke="#fbbf24" strokeWidth={2} name="Error rate (%)" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {!hasMetricSamples && <p className="mt-2 text-sm text-slate-400">No metric samples recorded in this period.</p>}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h4 className="text-lg font-semibold text-white">Risk summary</h4>
            <div className="mt-5 flex items-end gap-2">
              <div className="text-4xl font-semibold text-white">{summary.riskOverview.score}</div>
              <div className="pb-1 text-sm text-emerald-300">{summary.riskOverview.trend}</div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300"><span>Anomalies</span><span>{summary.riskOverview.anomalies}</span></div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h4 className="text-lg font-semibold text-white">Recent events</h4>
            <div className="mt-4 space-y-3">
              {(summary.recentEvents || []).map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                  <div className="mt-1 h-2 w-2 rounded-full bg-cyan-400" />
                  <div><div className="font-medium text-white">{event.type}</div><div>{event.message}</div></div>
                </div>
              ))}
              {!summary.recentEvents?.length && <p className="text-sm text-slate-400">No recent events.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <h4 className="text-lg font-semibold text-white">Alert queue</h4>
        <div className="mt-4 space-y-3">
          {(summary.alerts || []).map((alert) => (
            <div key={alert.id} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${alert.severity === 'critical' ? 'bg-rose-500/15 text-rose-300' : alert.severity === 'warning' ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-200'}`}>{alert.severity}</span>
                <span className="text-xs text-slate-400">{new Date(alert.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="mt-2 font-medium text-white">{alert.title}</p>
              <p className="text-sm text-slate-300">{alert.message}</p>
            </div>
          ))}
          {!summary.alerts?.length && <p className="text-sm text-slate-400">No active alerts.</p>}
        </div>
      </div>
    </div>
  );
}

function ProjectPage() {
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({ projectName: '', description: '', category: 'General', deadline: '', priority: 'medium' });
  const [taskForms, setTaskForms] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      setProjects((await apiRequest('/projects')).items);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const createProject = async (event) => {
    event.preventDefault();
    try {
      await apiRequest('/projects', { method: 'POST', body: JSON.stringify({ ...form, deadline: form.deadline || null }) });
      setForm({ projectName: '', description: '', category: 'General', deadline: '', priority: 'medium' });
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  const addTask = async (projectId) => {
    const task = taskForms[projectId];
    if (!task?.title?.trim()) return;
    try {
      await apiRequest(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(task) });
      setTaskForms({ ...taskForms, [projectId]: { title: '' } });
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  const updateTask = async (taskId, status) => {
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeProject = async (projectId) => {
    if (!window.confirm('Delete this project and its tasks?')) return;
    try {
      await apiRequest(`/projects/${projectId}`, { method: 'DELETE' });
      await loadProjects();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <SectionSkeleton />;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Project Monitor</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">Track delivery from plan to completion</h3>
      </div>
      {error && <ErrorState message={error} />}
      <form onSubmit={createProject} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-5">
        <input required value={form.projectName} onChange={(event) => setForm({ ...form, projectName: event.target.value })} placeholder="Project name" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
        <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Category" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
        <input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
        <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
          {['low', 'medium', 'high', 'critical'].map((priority) => <option key={priority}>{priority}</option>)}
        </select>
        <button className="rounded-xl bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">Create project</button>
        <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Description (optional)" className="md:col-span-5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" rows="2" />
      </form>
      <div className="grid gap-4 lg:grid-cols-2">
        {projects.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-slate-400">No projects yet. Create one to start tracking work.</div>}
        {projects.map((project) => (
          <div key={project.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-white">{project.projectName}</h4>
                <p className="text-sm text-slate-400">{project.category} · {project.priority}</p>
              </div>
              <button onClick={() => removeProject(project.id)} className="text-xs text-rose-300 hover:text-rose-200">Delete</button>
            </div>
            <p className="mt-3 text-sm text-slate-300">{project.description || 'No description provided.'}</p>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${project.progress}%` }} /></div>
              <span className="text-sm text-cyan-200">{project.progress}%</span>
            </div>
            <div className="mt-4 space-y-2">
              {project.tasks.map((task) => (
                <label key={task.id} className="flex items-center gap-2 rounded-lg bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
                  <input type="checkbox" checked={task.status === 'completed'} onChange={(event) => updateTask(task.id, event.target.checked ? 'completed' : 'pending')} />
                  <span className={task.status === 'completed' ? 'line-through text-slate-500' : ''}>{task.title}</span>
                </label>
              ))}
              <div className="flex gap-2">
                <input value={taskForms[project.id]?.title || ''} onChange={(event) => setTaskForms({ ...taskForms, [project.id]: { title: event.target.value } })} placeholder="Add a task" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
                <button onClick={() => addTask(project.id)} className="rounded-lg border border-cyan-500/40 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/10">Add</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourcesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', type: 'api', description: '', endpoint: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadResources = useCallback(async () => {
    try {
      const data = await apiRequest('/resources');
      setItems(data.items);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/resources', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', type: 'api', description: '', endpoint: '' });
      await loadResources();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiRequest(`/resources/${id}`, { method: 'DELETE' });
      await loadResources();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <SectionSkeleton />;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <h3 className="text-xl font-semibold text-white">Register monitored resource</h3>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
          <input required minLength={2} maxLength={80} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none ring-0 placeholder:text-slate-500" placeholder="Resource name" />
          <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100">
            <option value="api">API</option>
            <option value="service">Service</option>
            <option value="worker">Worker</option>
            <option value="database">Database</option>
          </select>
          <input type="url" value={form.endpoint} onChange={(e) => setForm((prev) => ({ ...prev, endpoint: e.target.value }))} className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 placeholder:text-slate-500" placeholder="https://example.com/health (optional)" />
          <textarea maxLength={250} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 placeholder:text-slate-500" placeholder="Description" rows={3} />
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2.5 font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving…' : 'Add resource'}</button>
          </div>
        </form>
      </div>

      {error && <ErrorState message={error} />}

      <div className="grid gap-4">
        {!items.length && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400">No monitored resources yet. Add one above to get started.</div>}
        {items.map((resource) => (
          <div key={resource.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h4 className="text-lg font-semibold text-white">{resource.name}</h4>
                  <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-cyan-200">{resource.type}</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{resource.description || 'No description provided.'}</p>
                <p className="mt-2 text-xs text-slate-400">{resource.endpoint || 'Sample endpoint'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${resource.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-300' : resource.status === 'critical' ? 'bg-rose-500/10 text-rose-300' : resource.status === 'unknown' || resource.status === 'sample' ? 'bg-slate-500/10 text-slate-300' : 'bg-amber-500/10 text-amber-300'}`}>{resource.status}</span>
                <button onClick={() => handleDelete(resource.id)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">Delete</button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {resource.metrics?.length ? resource.metrics.map((point) => (
                <div key={point.id} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{point.metric}</p>
                  <p className="mt-1 text-lg font-semibold text-white">{point.value}{point.unit}</p>
                </div>
              )) : <div className="text-sm text-slate-400">No metrics recorded yet.</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [rules, setRules] = useState([]);
  const [resources, setResources] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    resourceId: '',
    metric: 'response_time',
    operator: 'gt',
    threshold: 500,
    severity: 'warning',
    consecutiveChecks: 3,
    cooldownMinutes: 15,
  });

  const load = useCallback(async () => {
    try {
      const [alertData, ruleData, resourceData] = await Promise.all([
        apiRequest(filter === 'active' ? '/alerts' : `/alerts?status=${filter}`),
        apiRequest('/alert-rules'),
        apiRequest('/resources'),
      ]);
      setError('');
      setAlerts(filter === 'active' ? alertData.items.filter((alert) => alert.status !== 'resolved') : alertData.items);
      setRules(ruleData.items);
      setResources(resourceData.items);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (alertId, status) => {
    try {
      await apiRequest(`/alerts/${alertId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const createRule = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest('/alert-rules', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          threshold: Number(form.threshold),
          consecutiveChecks: Number(form.consecutiveChecks),
          cooldownMinutes: Number(form.cooldownMinutes),
        }),
      });
      setForm((previous) => ({ ...previous, name: '' }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changeRule = async (rule, changes) => {
    try {
      await apiRequest(`/alert-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeRule = async (ruleId) => {
    try {
      await apiRequest(`/alert-rules/${ruleId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <SectionSkeleton />;

  return (
    <div className="space-y-6">
      {error && <ErrorState message={error} />}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Rules</p><h3 className="mt-1 text-xl font-semibold text-white">Threshold alerting</h3></div>
          <span className="text-sm text-slate-400">Consecutive checks and cooldowns reduce noisy repeats.</span>
        </div>
        <form onSubmit={createRule} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500" placeholder="Rule name" />
          <select value={form.resourceId} onChange={(event) => setForm((previous) => ({ ...previous, resourceId: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">
            <option value="">All resources</option>{resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
          </select>
          <select value={form.metric} onChange={(event) => setForm((previous) => ({ ...previous, metric: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">
            <option value="response_time">Response time (ms)</option><option value="error_rate">Error rate (%)</option><option value="cpu">CPU (%)</option><option value="memory">Memory (%)</option>
          </select>
          <div className="flex gap-2">
            <select value={form.operator} onChange={(event) => setForm((previous) => ({ ...previous, operator: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">
              <option value="gt">&gt;</option><option value="gte">≥</option><option value="lt">&lt;</option><option value="lte">≤</option>
            </select>
            <input required type="number" min="0" step="any" value={form.threshold} onChange={(event) => setForm((previous) => ({ ...previous, threshold: event.target.value }))} className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white" aria-label="Threshold" />
          </div>
          <select value={form.severity} onChange={(event) => setForm((previous) => ({ ...previous, severity: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">
            <option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option>
          </select>
          <label className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">Consecutive checks<input type="number" min="1" max="20" value={form.consecutiveChecks} onChange={(event) => setForm((previous) => ({ ...previous, consecutiveChecks: event.target.value }))} className="mt-1 w-full bg-transparent text-sm text-white" /></label>
          <label className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">Cooldown (minutes)<input type="number" min="1" max="1440" value={form.cooldownMinutes} onChange={(event) => setForm((previous) => ({ ...previous, cooldownMinutes: event.target.value }))} className="mt-1 w-full bg-transparent text-sm text-white" /></label>
          <button type="submit" disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-60">{saving ? 'Saving…' : 'Create alert rule'}</button>
        </form>
        <div className="mt-4 grid gap-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
              <div>
                <p className="font-medium text-white">{rule.name}<span className="ml-2 text-xs uppercase text-slate-400">{rule.severity}</span></p>
                <p className="mt-1 text-xs text-slate-400">{rule.metric} {rule.operator} {rule.threshold} · {rule.consecutiveChecks} checks · {rule.cooldownMinutes}m cooldown · {rule.resourceId ? resources.find((resource) => resource.id === rule.resourceId)?.name || 'Resource' : 'All resources'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => changeRule(rule, { enabled: !rule.enabled })} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200">{rule.enabled ? 'Disable' : 'Enable'}</button>
                <button onClick={() => removeRule(rule.id)} className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-200">Delete</button>
              </div>
            </div>
          ))}
          {!rules.length && <p className="text-sm text-slate-400">No rules yet. Add a rule to evaluate incoming metrics.</p>}
        </div>
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Incidents</p><h3 className="mt-1 text-xl font-semibold text-white">Alert history</h3></div>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" aria-label="Filter alerts">
            <option value="active">Active alerts</option><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option>
          </select>
        </div>
        {alerts.map((alert) => (
          <div key={alert.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${alert.severity === 'critical' ? 'bg-rose-500/15 text-rose-300' : alert.severity === 'warning' ? 'bg-amber-500/15 text-amber-300' : 'bg-cyan-500/15 text-cyan-200'}`}>{alert.severity}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{alert.status}</span>
                  <span className="text-xs text-slate-500">{alert.occurrences || 1} occurrence(s)</span>
                </div>
                <h4 className="mt-3 text-lg font-semibold text-white">{alert.title}</h4>
              </div>
              {alert.status !== 'resolved' && <div className="flex gap-2">
                {alert.status !== 'acknowledged' && <button onClick={() => updateStatus(alert.id, 'acknowledged')} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">Acknowledge</button>}
                <button onClick={() => updateStatus(alert.id, 'resolved')} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">Resolve</button>
              </div>}
            </div>
            <p className="mt-3 text-sm text-slate-300">{alert.message}</p>
            <p className="mt-2 text-xs text-slate-400">{alert.resourceName} · {new Date(alert.createdAt).toLocaleString()}</p>
          </div>
        ))}
        {!alerts.length && <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-400">No alerts match this filter.</div>}
      </section>
    </div>
  );
}

function AnalyticsPage() {
  const [summary, setSummary] = useState(null);
  const [days, setDays] = useState(7);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest(`/reports/summary?days=${days}`)
      .then((data) => { setSummary(data); setError(''); })
      .catch((err) => setError(err.message));
  }, [days]);

  const metrics = [
    { label: 'Average response time', value: `${(summary?.metricStats?.response_time?.average || 0).toFixed(0)} ms` },
    { label: 'Average error rate', value: `${(summary?.metricStats?.error_rate?.average || 0).toFixed(2)}%` },
    { label: 'Mean time to resolve', value: `${(summary?.mttrMinutes || 0).toFixed(0)} min` },
  ];

  return (
    <div className="space-y-6">
      {error && <ErrorState message={error} />}
      <div className="flex items-center justify-between">
        <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Analytics</p><h3 className="mt-1 text-xl font-semibold text-white">Observed metrics and incident trends</h3></div>
        <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-white" aria-label="Analytics period">
          <option value={1}>24 hours</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-sm text-slate-400">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="text-lg font-semibold text-white">Six-period trend</h3>
        <p className="mt-1 text-sm text-slate-400">Values are averages of recorded agent samples; empty intervals are left blank.</p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={summary?.trend || []}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
              <XAxis dataKey="at" tickFormatter={(value) => new Date(value).toLocaleDateString()} stroke="#64748b" />
              <YAxis yAxisId="response" stroke="#22d3ee" />
              <YAxis yAxisId="error" orientation="right" stroke="#fbbf24" />
              <Tooltip labelFormatter={(value) => new Date(value).toLocaleString()} contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: 12 }} />
              <Legend />
              <Line yAxisId="response" type="monotone" dataKey="responseTimeAvg" name="Response time (ms)" stroke="#22d3ee" connectNulls={false} />
              <Line yAxisId="error" type="monotone" dataKey="errorRateAvg" name="Error rate (%)" stroke="#fbbf24" connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ReportsPage() {
  const [summary, setSummary] = useState(null);
  const [days, setDays] = useState(7);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest(`/reports/summary?days=${days}`)
      .then((data) => { setSummary(data); setError(''); })
      .catch((err) => setError(err.message));
  }, [days]);

  const exportCsv = async () => {
    try {
      const csv = await apiRequest(`/reports/export?days=${days}`);
      downloadCsv(`sentinel-report-${days}d.csv`, csv);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {error && <ErrorState message={error} />}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Reports</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Operational overview</h3>
          </div>
          <div className="flex gap-2">
            <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" aria-label="Report period">
              <option value={1}>24 hours</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
            </select>
            <button onClick={exportCsv} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200">Export CSV</button>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">Resources</p><p className="mt-2 text-2xl font-semibold text-white">{summary?.totalResources || 0}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">Incidents</p><p className="mt-2 text-2xl font-semibold text-white">{summary?.totalAlerts || 0}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">Critical</p><p className="mt-2 text-2xl font-semibold text-white">{summary?.bySeverity?.critical || 0}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">Warnings</p><p className="mt-2 text-2xl font-semibold text-white">{summary?.bySeverity?.warning || 0}</p></div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">Mean time to resolve</p><p className="mt-2 text-2xl font-semibold text-white">{(summary?.mttrMinutes || 0).toFixed(0)} min</p></div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
        <div className="border-b border-slate-800 px-5 py-4"><h4 className="font-semibold text-white">Resource health and sample coverage</h4></div>
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Resource</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Samples</th><th className="px-5 py-3">Alerts</th><th className="px-5 py-3">Last check</th></tr></thead>
          <tbody>
            {(summary?.resources || []).map((resource) => (
              <tr key={resource.id} className="border-t border-slate-800 text-slate-300">
                <td className="px-5 py-3 font-medium text-white">{resource.name}</td><td className="px-5 py-3">{resource.status}</td><td className="px-5 py-3">{resource.metrics}</td><td className="px-5 py-3">{resource.alerts}</td><td className="px-5 py-3">{resource.lastPollAt ? new Date(resource.lastPollAt).toLocaleString() : 'No samples'}</td>
              </tr>
            ))}
            {!summary?.resources?.length && <tr><td className="px-5 py-5 text-slate-400" colSpan="5">No resources are configured yet.</td></tr>}
          </tbody>
        </table>
        <p className="px-5 pb-4 text-xs text-slate-500">Report generated {summary?.generatedAt ? new Date(summary.generatedAt).toLocaleString() : '—'} · {summary?.byStatus?.open || 0} open, {summary?.byStatus?.acknowledged || 0} acknowledged, {summary?.byStatus?.resolved || 0} resolved</p>
      </div>
    </div>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState({ alertThresholds: { warning: 70, critical: 90 }, notifications: { inApp: true, email: true }, collectionIntervalMinutes: 5 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/settings')
      .then((data) => { setSettings(data.settings); setError(''); })
      .catch((err) => setError(err.message));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = await apiRequest('/settings', { method: 'PATCH', body: JSON.stringify(settings) });
      setSettings(data.settings);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <h3 className="text-xl font-semibold text-white">Monitoring configuration</h3>
        {error && <div className="mt-4"><ErrorState message={error} /></div>}
        <form onSubmit={save}>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">Warning threshold (%)<input required type="number" min="1" max="99" value={settings.alertThresholds?.warning ?? 70} onChange={(e) => setSettings((prev) => ({ ...prev, alertThresholds: { ...prev.alertThresholds, warning: Number(e.target.value) } }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-white" /></label>
            <label className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">Critical threshold (%)<input required type="number" min="2" max="100" value={settings.alertThresholds?.critical ?? 90} onChange={(e) => setSettings((prev) => ({ ...prev, alertThresholds: { ...prev.alertThresholds, critical: Number(e.target.value) } }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-white" /></label>
            <label className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">Collection interval (minutes)<input required type="number" min="1" max="60" value={settings.collectionIntervalMinutes ?? 5} onChange={(e) => setSettings((prev) => ({ ...prev, collectionIntervalMinutes: Number(e.target.value) }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-white" /></label>
            <label className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">Retention (days)<input required type="number" min="1" max="365" value={settings.retentionDays ?? 30} onChange={(e) => setSettings((prev) => ({ ...prev, retentionDays: Number(e.target.value) }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-white" /></label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving…' : 'Save settings'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfilePage() {
  const { user } = useAuth();
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <h3 className="text-xl font-semibold text-white">Profile</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">Name</p><p className="mt-2 text-lg font-semibold text-white">{user?.name}</p></div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">Email</p><p className="mt-2 text-lg font-semibold text-white">{user?.email}</p></div>
      </div>
    </div>
  );
}

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'demo@sentinel.local', password: 'Admin123!' });
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    try {
      await login(form);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-cyan-950/20">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/15 p-2 text-cyan-300"><ShieldCheck size={22} /></div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Sentinel</p>
            <h1 className="text-2xl font-semibold text-white">Secure login</h1>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100" placeholder="Email" />
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100" placeholder="Password" />
          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
          <button type="submit" className="w-full rounded-xl bg-cyan-500 px-4 py-2.5 font-medium text-slate-950 transition hover:bg-cyan-400">Login</button>
        </form>
        <div className="mt-5 text-center text-sm text-slate-300">Need a new account? <Link to="/register" className="text-cyan-300">Register</Link></div>
      </div>
    </div>
  );
}

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-cyan-950/20">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/15 p-2 text-cyan-300"><ShieldCheck size={22} /></div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Sentinel</p>
            <h1 className="text-2xl font-semibold text-white">Create account</h1>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100" placeholder="Name" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100" placeholder="Email" />
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100" placeholder="Password" />
          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
          <button type="submit" className="w-full rounded-xl bg-cyan-500 px-4 py-2.5 font-medium text-slate-950 transition hover:bg-cyan-400">Register</button>
        </form>
        <div className="mt-5 text-center text-sm text-slate-300">Already have an account? <Link to="/login" className="text-cyan-300">Login</Link></div>
      </div>
    </div>
  );
}

function ErrorState({ message }) {
  return <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{message}</div>;
}

function SectionSkeleton() {
  return <div className="space-y-4">
    {[...Array(3)].map((_, idx) => <div key={idx} className="h-40 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />)}
  </div>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <PageLoading />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/" element={<ProtectedRoute><AppShell><DashboardPage /></AppShell></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><AppShell><ProjectPage /></AppShell></ProtectedRoute>} />
      <Route path="/resources" element={<ProtectedRoute><AppShell><ResourcesPage /></AppShell></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute><AppShell><AlertsPage /></AppShell></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><AppShell><AnalyticsPage /></AppShell></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><AppShell><ReportsPage /></AppShell></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppShell><SettingsPage /></AppShell></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><AppShell><ProfilePage /></AppShell></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
