import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import {
  connectStore,
  createAlert,
  createAlertRule,
  createEvent,
  createMetrics,
  createResource,
  createProject,
  createTask,
  createDataset,
  createDataRecord,
  createUser,
  defaultSettings,
  deleteAlertRule,
  deleteResource,
  deleteProject,
  deleteTask,
  deleteDataset,
  deleteDataRecord,
  findActiveAlert,
  findAlert,
  findResource,
  findProject,
  findDataset,
  findUserByEmail,
  findUserById,
  getSettings,
  listAlertRules,
  listAlerts,
  listEvents,
  listMetrics,
  listResources,
  listProjects,
  listTasks,
  listDatasets,
  listDataRecords,
  mongoConnected,
  saveSettings,
  updateAlert,
  updateAlertRule,
  updateResource,
  updateProject,
  updateTask,
  updateDataRecord,
} from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const app = express();

const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProd ? '' : 'sentinel-dev-secret');
if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured in production.');
const frontendOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const mongoState = { connected: false, mode: 'demo' };
mongoose.connection.on('connected', () => {
  mongoState.connected = true;
  mongoState.mode = 'mongodb';
});
mongoose.connection.on('disconnected', () => {
  mongoState.connected = false;
  mongoState.mode = process.env.MONGODB_URI ? 'disconnected' : 'demo';
});
const id = () => `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const now = () => new Date();
const isoNow = () => now().toISOString();
const hashPassword = (value) => bcrypt.hash(value, 10);
const createToken = (user) => jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role || 'user',
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(80),
});

const resourceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.string().trim().min(2).max(40),
  description: z.string().max(250).optional(),
  endpoint: z.string().url().optional().or(z.literal('')),
});

const resourcePatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  type: z.string().trim().min(2).max(40).optional(),
  description: z.string().max(250).optional(),
  endpoint: z.string().url().or(z.literal('')).optional(),
  status: z.enum(['healthy', 'warning', 'critical', 'unknown', 'sample']).optional(),
}).strict();

const metricSchema = z.object({
  metric: z.enum(['cpu', 'memory', 'response_time', 'error_rate']),
  value: z.number().finite().min(0).max(1_000_000_000),
  unit: z.string().max(20).optional(),
  observedAt: z.coerce.date().optional(),
});

const alertRuleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  resourceId: z.string().optional().default(''),
  metric: z.enum(['cpu', 'memory', 'response_time', 'error_rate']),
  operator: z.enum(['gt', 'gte', 'lt', 'lte']),
  threshold: z.number().finite().min(0).max(1_000_000_000),
  severity: z.enum(['critical', 'warning', 'info']),
  consecutiveChecks: z.number().int().min(1).max(20).default(1),
  cooldownMinutes: z.number().int().min(1).max(1440).default(15),
  enabled: z.boolean().default(true),
});

const alertRulePatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  resourceId: z.string().optional(),
  metric: z.enum(['cpu', 'memory', 'response_time', 'error_rate']).optional(),
  operator: z.enum(['gt', 'gte', 'lt', 'lte']).optional(),
  threshold: z.number().finite().min(0).max(1_000_000_000).optional(),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  consecutiveChecks: z.number().int().min(1).max(20).optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).optional(),
  enabled: z.boolean().optional(),
}).strict();
const alertStatusSchema = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved']),
});
const projectSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  startDate: z.coerce.date().nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['planned', 'active', 'completed', 'on_hold']).optional(),
  progress: z.number().finite().min(0).max(100).optional(),
  manualProgress: z.boolean().optional(),
}).strict();
const taskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  dueDate: z.coerce.date().nullable().optional(),
}).strict();
const datasetSchema = z.object({
  datasetName: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  fields: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
}).strict();
const dataRecordSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  recordedAt: z.coerce.date().optional(),
}).strict();
const settingsPatchSchema = z.object({
  timezone: z.string().trim().min(1).max(80).optional(),
  alertThresholds: z.object({
    warning: z.number().min(1).max(100),
    critical: z.number().min(1).max(100),
  }).optional(),
  notifications: z.object({
    email: z.boolean().optional(),
    inApp: z.boolean().optional(),
    sms: z.boolean().optional(),
  }).optional(),
  collectionIntervalMinutes: z.number().int().min(1).max(60).optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
}).strict();

const validateMonitoringUrl = (endpoint) => {
  if (!endpoint) return;
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https endpoints are allowed.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    throw new Error('Private or local endpoints are blocked.');
  }
  if (host.includes('169.254.') || host === 'metadata.google.internal' || host === 'metadata') {
    throw new Error('Blocked metadata endpoint.');
  }
  const octets = host.split('.');
  if (octets.length === 4 && octets.every((part) => /^\d+$/.test(part))) {
    const [first, second] = octets.map(Number);
    if (first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)) {
      throw new Error('Private IP address blocked.');
    }
  }
};

const addEvent = (userId, type, message, details = {}) => createEvent({
  id: id(),
  userId,
  type,
  message,
  details,
  createdAt: isoNow(),
});

const generateSeedMetrics = (resource) => {
  const base = [
    { metric: 'cpu', value: 42, unit: '%' },
    { metric: 'memory', value: 58, unit: '%' },
    { metric: 'response_time', value: 294, unit: 'ms' },
    { metric: 'error_rate', value: 1.2, unit: '%' },
  ];
  return base.map((point, index) => ({
    id: id(),
    resourceId: resource.id,
    ownerId: resource.ownerId,
    metric: point.metric,
    value: point.value + index * 4,
    unit: point.unit,
    observedAt: new Date(Date.now() - index * 6 * 60 * 1000).toISOString(),
    source: 'sample',
  }));
};

const seedDemoData = async () => {
  const seedEnabled = process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA === 'true';
  if (mongoConnected() && !seedEnabled) return;
  let demoUser = await findUserByEmail('demo@sentinel.local');
  if (!demoUser) {
    demoUser = await createUser({
      id: id(),
      name: 'Demo Operator',
      email: 'demo@sentinel.local',
      passwordHash: await hashPassword('Admin123!'),
      role: 'admin',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    });
  }

  if ((await listResources(demoUser.id)).length === 0) {
    const examples = [
      { name: 'Payments API', type: 'api', description: 'Primary ingest service', endpoint: 'https://payments.example.com/health' },
      { name: 'Auth Service', type: 'service', description: 'Identity and session provider', endpoint: 'https://auth.example.com/health' },
      { name: 'Analytics Worker', type: 'worker', description: 'Background aggregation pipeline', endpoint: 'https://analytics.example.com/health' },
    ];
    for (const example of examples) {
      const resource = await createResource({
        id: id(),
        ownerId: demoUser.id,
        ...example,
        status: 'healthy',
        lastPollAt: isoNow(),
        createdAt: isoNow(),
        updatedAt: isoNow(),
      });
      await createMetrics(generateSeedMetrics(resource));
    }
  }

  if ((await listAlerts(demoUser.id)).length === 0) {
    const [resource] = await listResources(demoUser.id);
    await createAlert({
      id: id(),
      userId: demoUser.id,
      resourceId: resource?.id || 'demo',
      severity: 'warning',
      title: 'Latency spike detected',
      message: 'Response time exceeded the warning threshold for 3 consecutive checks.',
      status: 'open',
      occurrences: 1,
      createdAt: isoNow(),
      updatedAt: isoNow(),
      acknowledgedAt: null,
      resolvedAt: null,
      lastTriggeredAt: isoNow(),
    });
  }
  if ((await listEvents(demoUser.id, 1)).length === 0) {
    await addEvent(demoUser.id, 'health_check', 'Health checks completed successfully.');
    await addEvent(demoUser.id, 'metric_update', 'CPU baseline recalculated.');
  }
};

const getAuthorizedResource = (userId, resourceId) => findResource(userId, resourceId);

const serializeAlert = async (alert, resourceMap) => ({
  ...alert,
  resourceName: resourceMap.get(alert.resourceId)?.name || 'Unknown resource',
});

const dashboardPayload = async (userId) => {
  const [userResources, userAlerts, recentEvents] = await Promise.all([
    listResources(userId),
    listAlerts(userId),
    listEvents(userId, 5),
  ]);
  const activeAlerts = userAlerts.filter((alert) => ['open', 'acknowledged'].includes(alert.status));
  const healthy = userResources.filter((resource) => resource.status === 'healthy').length;
  const attention = userResources.length - healthy;
  return {
    totalResources: userResources.length,
    healthyResources: healthy,
    resourcesNeedingAttention: attention,
    criticalAlerts: activeAlerts.filter((alert) => alert.severity === 'critical').length,
    recentEvents,
    riskOverview: {
      score: Math.min(100, 30 + activeAlerts.length * 18 + attention * 7),
      trend: 'stable',
      anomalies: activeAlerts.length,
    },
    alerts: activeAlerts.slice(0, 5),
    demoMode: !mongoConnected(),
  };
};

const comparison = (value, operator, threshold) => ({
  gt: value > threshold,
  gte: value >= threshold,
  lt: value < threshold,
  lte: value <= threshold,
}[operator]);

const evaluateAlertRules = async (userId, resource, metricPoint) => {
  const rules = (await listAlertRules(userId)).filter((rule) => rule.enabled
    && rule.metric === metricPoint.metric
    && (!rule.resourceId || rule.resourceId === resource.id));

  for (const rule of rules) {
    const recent = await listMetrics(userId, {
      resourceId: resource.id,
      metric: rule.metric,
      limit: rule.consecutiveChecks,
    });
    if (recent.length < rule.consecutiveChecks
      || !recent.every((sample) => comparison(sample.value, rule.operator, rule.threshold))) continue;

    const fingerprint = `${rule.id}:${resource.id}`;
    const existing = await findActiveAlert(userId, fingerprint);
    const triggeredAt = now();
    const details = {
      ruleId: rule.id,
      ruleName: rule.name,
      metric: metricPoint.metric,
      value: metricPoint.value,
      unit: metricPoint.unit,
      operator: rule.operator,
      threshold: rule.threshold,
      consecutiveChecks: rule.consecutiveChecks,
    };
    const message = `${rule.name}: ${metricPoint.metric} is ${metricPoint.value}${metricPoint.unit || ''} (${rule.operator} ${rule.threshold}) for ${rule.consecutiveChecks} consecutive check(s).`;

    if (existing) {
      const cooldownElapsed = triggeredAt - new Date(existing.lastTriggeredAt || existing.createdAt)
        >= rule.cooldownMinutes * 60 * 1000;
      await updateAlert(userId, existing.id, {
        details,
        message,
        updatedAt: isoNow(),
        ...(cooldownElapsed ? { lastTriggeredAt: triggeredAt.toISOString() } : {}),
      }, true);
      continue;
    }

    const alert = await createAlert({
      id: id(),
      userId,
      resourceId: resource.id,
      ruleId: rule.id,
      fingerprint,
      severity: rule.severity,
      title: rule.name,
      message,
      details,
      status: 'open',
      occurrences: 1,
      createdAt: triggeredAt.toISOString(),
      updatedAt: triggeredAt.toISOString(),
      acknowledgedAt: null,
      resolvedAt: null,
      lastTriggeredAt: triggeredAt.toISOString(),
    });
    await addEvent(userId, 'alert_triggered', `Alert triggered: ${rule.name}`, { alertId: alert.id, resourceId: resource.id });
  }
};

const getReportPeriod = (value) => {
  const parsed = z.coerce.number().int().min(1).max(90).safeParse(value ?? 7);
  if (!parsed.success) throw new Error('Report period must be between 1 and 90 days.');
  return parsed.data;
};

const percentile = (values, fraction) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};

const createReport = async (userId, days) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [resources, alerts, metrics] = await Promise.all([
    listResources(userId),
    listAlerts(userId, { since }),
    listMetrics(userId, { since }),
  ]);
  const activeAlerts = alerts.filter((alert) => alert.status !== 'resolved');
  const metricStats = {};
  for (const metric of ['response_time', 'error_rate', 'cpu', 'memory']) {
    const values = metrics.filter((point) => point.metric === metric).map((point) => point.value);
    metricStats[metric] = {
      samples: values.length,
      average: values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0,
      p95: percentile(values, 0.95),
    };
  }

  const bucketCount = 6;
  const bucketSize = (Date.now() - since.getTime()) / bucketCount;
  const trend = Array.from({ length: bucketCount }, (_, index) => {
    const start = since.getTime() + index * bucketSize;
    const end = index === bucketCount - 1 ? Date.now() + 1 : start + bucketSize;
    const bucket = metrics.filter((point) => {
      const timestamp = new Date(point.observedAt).getTime();
      return timestamp >= start && timestamp < end;
    });
    const averageFor = (metric) => {
      const values = bucket.filter((point) => point.metric === metric).map((point) => point.value);
      return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
    };
    return {
      at: new Date(start).toISOString(),
      responseTimeAvg: averageFor('response_time'),
      errorRateAvg: averageFor('error_rate'),
    };
  });

  const resolvedDurations = alerts
    .filter((alert) => alert.status === 'resolved' && alert.resolvedAt)
    .map((alert) => Math.max(0, new Date(alert.resolvedAt) - new Date(alert.createdAt)) / 60000);
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));

  return {
    periodDays: days,
    generatedAt: isoNow(),
    totalResources: resources.length,
    totalAlerts: alerts.length,
    activeAlerts: activeAlerts.length,
    bySeverity: {
      critical: alerts.filter((alert) => alert.severity === 'critical').length,
      warning: alerts.filter((alert) => alert.severity === 'warning').length,
      info: alerts.filter((alert) => alert.severity === 'info').length,
    },
    byStatus: {
      open: alerts.filter((alert) => alert.status === 'open').length,
      acknowledged: alerts.filter((alert) => alert.status === 'acknowledged').length,
      resolved: alerts.filter((alert) => alert.status === 'resolved').length,
    },
    mttrMinutes: resolvedDurations.length
      ? resolvedDurations.reduce((total, duration) => total + duration, 0) / resolvedDurations.length
      : 0,
    metricStats,
    trend,
    resources: resources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      status: resource.status,
      lastPollAt: resource.lastPollAt,
      alerts: alerts.filter((alert) => alert.resourceId === resource.id).length,
      metrics: metrics.filter((point) => point.resourceId === resource.id).length,
    })),
    alertItems: alerts.map((alert) => ({
      ...alert,
      resourceName: resourcesById.get(alert.resourceId)?.name || 'Unknown resource',
    })),
  };
};

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", ...(!isProd ? ['http://localhost:3001', 'http://localhost:5173'] : frontendOrigins)],
    },
  },
}));
app.use(morgan('dev'));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || !isProd || frontendOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api/v1', rateLimit({ windowMs: 60 * 1000, max: 180, standardHeaders: true, legacyHeaders: false }));

app.get('/api/v1/health', (req, res) => {
  const ready = !process.env.MONGODB_URI || mongoose.connection.readyState === 1;
  return res.status(ready ? 200 : 503).json({
    ok: ready,
    service: 'Sentinel',
    mode: mongoState.connected ? 'mongodb' : 'demo',
    mongo: { ...mongoState, readyState: mongoose.connection.readyState },
    ready,
    timestamp: isoNow(),
  });
});

app.get('/api/v1/health/ready', (req, res) => {
  const ready = !process.env.MONGODB_URI || mongoose.connection.readyState === 1;
  return res.status(ready ? 200 : 503).json({
    ok: ready,
    ready,
    database: mongoConnected() ? 'connected' : process.env.MONGODB_URI ? 'disconnected' : 'demo-mode',
    timestamp: isoNow(),
  });
});

app.post('/api/v1/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Registration data is invalid.' });
  const payload = { ...parsed.data, email: parsed.data.email.toLowerCase() };
  if (await findUserByEmail(payload.email)) {
    return res.status(409).json({ message: 'An account already exists for this email address.' });
  }
  try {
    const user = await createUser({
      id: id(),
      name: payload.name,
      email: payload.email,
      passwordHash: await hashPassword(payload.password),
      role: 'user',
      createdAt: isoNow(),
      updatedAt: isoNow(),
    });
    await addEvent(user.id, 'user_registered', 'User registered successfully.');
    const token = createToken(user);
    res.cookie('jwt', token, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.status(201).json({ user: sanitizeUser(user), token });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An account already exists for this email address.' });
    throw error;
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  if (!email || typeof password !== 'string') return res.status(400).json({ message: 'Email and password are required.' });
  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }
  const token = createToken(user);
  res.cookie('jwt', token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  await addEvent(user.id, 'user_login', 'User logged in.');
  return res.json({ user: sanitizeUser(user), token });
});

app.post('/api/v1/auth/logout', (req, res) => {
  res.clearCookie('jwt', { httpOnly: true, sameSite: isProd ? 'none' : 'lax', secure: isProd });
  return res.json({ ok: true });
});

const authMiddleware = async (req, res, next) => {
  const token = req.cookies?.jwt || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Authentication required.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await findUserById(decoded.sub);
    if (!req.user) return res.status(401).json({ message: 'Invalid or expired session.' });
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Invalid or expired session.' });
    }
    return next(error);
  }
};

app.get('/api/v1/auth/me', authMiddleware, (req, res) => res.json({ user: sanitizeUser(req.user) }));

app.get('/api/v1/dashboard/summary', authMiddleware, async (req, res) => {
  return res.json(await dashboardPayload(req.user.id));
});

const projectWithProgress = async (project, userId) => {
  const tasks = await listTasks(userId, project.id);
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const progress = project.manualProgress ? project.progress : (tasks.length ? Math.round((completed / tasks.length) * 100) : 0);
  return { ...project, progress, tasks, taskCount: tasks.length, completedTaskCount: completed };
};

app.get('/api/v1/projects', authMiddleware, async (req, res) => {
  const projects = await listProjects(req.user.id);
  const items = await Promise.all(projects.map((project) => projectWithProgress(project, req.user.id)));
  return res.json({ items, total: items.length });
});

app.post('/api/v1/projects', authMiddleware, async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Project data is invalid.' });
  const project = await createProject({
    id: id(),
    userId: req.user.id,
    projectName: parsed.data.projectName,
    description: parsed.data.description || '',
    category: parsed.data.category || 'General',
    startDate: parsed.data.startDate || null,
    deadline: parsed.data.deadline || null,
    priority: parsed.data.priority || 'medium',
    status: parsed.data.status || 'planned',
    progress: parsed.data.progress || 0,
    manualProgress: parsed.data.manualProgress === true,
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });
  await addEvent(req.user.id, 'project_created', `Created project ${project.projectName}.`, { projectId: project.id });
  return res.status(201).json(await projectWithProgress(project, req.user.id));
});

app.get('/api/v1/projects/:id', authMiddleware, async (req, res) => {
  const project = await findProject(req.user.id, req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  return res.json(await projectWithProgress(project, req.user.id));
});

app.patch('/api/v1/projects/:id', authMiddleware, async (req, res) => {
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ message: 'Project update is invalid.' });
  const project = await updateProject(req.user.id, req.params.id, { ...parsed.data, updatedAt: isoNow() });
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  await addEvent(req.user.id, 'project_updated', `Updated project ${project.projectName}.`, { projectId: project.id });
  return res.json(await projectWithProgress(project, req.user.id));
});

app.delete('/api/v1/projects/:id', authMiddleware, async (req, res) => {
  const project = await deleteProject(req.user.id, req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  await addEvent(req.user.id, 'project_deleted', `Deleted project ${project.projectName}.`, { projectId: project.id });
  return res.json({ ok: true, deleted: project.id });
});

app.get('/api/v1/projects/:id/tasks', authMiddleware, async (req, res) => {
  const project = await findProject(req.user.id, req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  const items = await listTasks(req.user.id, project.id);
  return res.json({ items, total: items.length });
});

app.post('/api/v1/projects/:id/tasks', authMiddleware, async (req, res) => {
  const project = await findProject(req.user.id, req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Task data is invalid.' });
  const task = await createTask({
    id: id(),
    userId: req.user.id,
    projectId: project.id,
    ...parsed.data,
    description: parsed.data.description || '',
    priority: parsed.data.priority || 'medium',
    status: parsed.data.status || 'pending',
    dueDate: parsed.data.dueDate || null,
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });
  await addEvent(req.user.id, 'task_created', `Created task ${task.title}.`, { projectId: project.id, taskId: task.id });
  return res.status(201).json(await projectWithProgress(project, req.user.id));
});

app.patch('/api/v1/tasks/:id', authMiddleware, async (req, res) => {
  const parsed = taskSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ message: 'Task update is invalid.' });
  const task = await updateTask(req.user.id, req.params.id, { ...parsed.data, updatedAt: isoNow() });
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  return res.json(task);
});

app.delete('/api/v1/tasks/:id', authMiddleware, async (req, res) => {
  const task = await deleteTask(req.user.id, req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  await addEvent(req.user.id, 'task_deleted', `Deleted task ${task.title}.`, { projectId: task.projectId, taskId: task.id });
  return res.json({ ok: true, deleted: task.id });
});

app.get('/api/v1/datasets', authMiddleware, async (req, res) => {
  const datasets = await listDatasets(req.user.id);
  const items = await Promise.all(datasets.map(async (dataset) => ({
    ...dataset,
    recordCount: (await listDataRecords(req.user.id, dataset.id)).length,
  })));
  return res.json({ items, total: items.length });
});

app.post('/api/v1/datasets', authMiddleware, async (req, res) => {
  const parsed = datasetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Dataset data is invalid.' });
  const dataset = await createDataset({
    id: id(),
    userId: req.user.id,
    ...parsed.data,
    description: parsed.data.description || '',
    category: parsed.data.category || 'General',
    fields: parsed.data.fields || [],
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });
  return res.status(201).json({ ...dataset, recordCount: 0 });
});

app.get('/api/v1/datasets/:id/records', authMiddleware, async (req, res) => {
  const dataset = await findDataset(req.user.id, req.params.id);
  if (!dataset) return res.status(404).json({ message: 'Dataset not found.' });
  return res.json({ items: await listDataRecords(req.user.id, dataset.id) });
});

app.post('/api/v1/datasets/:id/records', authMiddleware, async (req, res) => {
  const dataset = await findDataset(req.user.id, req.params.id);
  if (!dataset) return res.status(404).json({ message: 'Dataset not found.' });
  const parsed = dataRecordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Data record is invalid.' });
  const record = await createDataRecord({
    id: id(),
    datasetId: dataset.id,
    userId: req.user.id,
    values: parsed.data.values,
    recordedAt: parsed.data.recordedAt || isoNow(),
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });
  return res.status(201).json(record);
});

app.patch('/api/v1/records/:id', authMiddleware, async (req, res) => {
  const parsed = dataRecordSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ message: 'Data record update is invalid.' });
  const record = await updateDataRecord(req.user.id, req.params.id, { ...parsed.data, updatedAt: isoNow() });
  if (!record) return res.status(404).json({ message: 'Data record not found.' });
  return res.json(record);
});

app.delete('/api/v1/records/:id', authMiddleware, async (req, res) => {
  const record = await deleteDataRecord(req.user.id, req.params.id);
  if (!record) return res.status(404).json({ message: 'Data record not found.' });
  return res.json({ ok: true, deleted: record.id });
});

app.delete('/api/v1/datasets/:id', authMiddleware, async (req, res) => {
  const dataset = await deleteDataset(req.user.id, req.params.id);
  if (!dataset) return res.status(404).json({ message: 'Dataset not found.' });
  return res.json({ ok: true, deleted: dataset.id });
});

app.get('/api/v1/resources', authMiddleware, async (req, res) => {
  const resources = await listResources(req.user.id);
  const items = await Promise.all(resources.map(async (resource) => ({
    ...resource,
    metrics: await listMetrics(req.user.id, { resourceId: resource.id, limit: 10 }),
  })));
  return res.json({ items, total: items.length });
});

app.post('/api/v1/resources', authMiddleware, async (req, res) => {
  const parsed = resourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Resource data is invalid.' });
  try {
    if (parsed.data.endpoint) validateMonitoringUrl(parsed.data.endpoint);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  const resource = await createResource({
    id: id(),
    ownerId: req.user.id,
    ...parsed.data,
    description: parsed.data.description || '',
    endpoint: parsed.data.endpoint || '',
    status: 'unknown',
    lastPollAt: null,
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });
  await addEvent(req.user.id, 'resource_created', `Created resource ${resource.name}.`, { resourceId: resource.id });
  return res.status(201).json(resource);
});

app.get('/api/v1/resources/:id', authMiddleware, async (req, res) => {
  const resource = await getAuthorizedResource(req.user.id, req.params.id);
  if (!resource) return res.status(404).json({ message: 'Resource not found.' });
  return res.json({ ...resource, metrics: await listMetrics(req.user.id, { resourceId: resource.id, limit: 10 }) });
});

app.patch('/api/v1/resources/:id', authMiddleware, async (req, res) => {
  const parsed = resourcePatchSchema.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data || {}).length === 0) {
    return res.status(400).json({ message: 'Resource update is invalid.' });
  }
  if (parsed.data.endpoint) {
    try {
      validateMonitoringUrl(parsed.data.endpoint);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
  const previous = await getAuthorizedResource(req.user.id, req.params.id);
  if (!previous) return res.status(404).json({ message: 'Resource not found.' });
  const resource = await updateResource(req.user.id, previous.id, { ...parsed.data, updatedAt: isoNow() });
  if (['warning', 'critical'].includes(resource.status) && resource.status !== previous.status) {
    const severity = resource.status;
    const fingerprint = `resource-status:${resource.id}:${severity}`;
    if (!(await findActiveAlert(req.user.id, fingerprint))) {
      await createAlert({
        id: id(),
        userId: req.user.id,
        resourceId: resource.id,
        fingerprint,
        severity,
        title: `${resource.name} is ${severity}`,
        message: `Resource status changed from ${previous.status} to ${severity}.`,
        status: 'open',
        occurrences: 1,
        details: { previousStatus: previous.status, status: severity },
        createdAt: isoNow(),
        updatedAt: isoNow(),
        lastTriggeredAt: isoNow(),
      });
    }
  }
  await addEvent(req.user.id, 'resource_updated', `Updated resource ${resource.name}.`, { resourceId: resource.id });
  return res.json(resource);
});

app.delete('/api/v1/resources/:id', authMiddleware, async (req, res) => {
  const deleted = await deleteResource(req.user.id, req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Resource not found.' });
  await addEvent(req.user.id, 'resource_deleted', `Deleted resource ${deleted.name}.`, { resourceId: deleted.id });
  return res.json({ ok: true, deleted: deleted.id });
});

app.get('/api/v1/resources/:id/metrics', authMiddleware, async (req, res) => {
  const resource = await getAuthorizedResource(req.user.id, req.params.id);
  if (!resource) return res.status(404).json({ message: 'Resource not found.' });
  return res.json({
    resourceId: resource.id,
    metrics: await listMetrics(req.user.id, { resourceId: resource.id, limit: 1000 }),
  });
});

app.post('/api/v1/resources/:id/metrics', authMiddleware, async (req, res) => {
  const parsed = metricSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Metric payload is invalid.' });
  const resource = await getAuthorizedResource(req.user.id, req.params.id);
  if (!resource) return res.status(404).json({ message: 'Resource not found.' });
  const point = {
    id: id(),
    ownerId: req.user.id,
    resourceId: resource.id,
    metric: parsed.data.metric,
    value: parsed.data.value,
    unit: parsed.data.unit || (parsed.data.metric === 'response_time' ? 'ms' : '%'),
    observedAt: (parsed.data.observedAt || now()).toISOString(),
    source: 'agent',
  };
  await createMetrics([point]);
  await updateResource(req.user.id, resource.id, { status: 'healthy', lastPollAt: point.observedAt, updatedAt: isoNow() });
  await evaluateAlertRules(req.user.id, resource, point);
  return res.status(201).json(point);
});

app.get('/api/v1/alerts', authMiddleware, async (req, res) => {
  const statusParsed = req.query.status
    ? z.enum(['open', 'acknowledged', 'resolved']).safeParse(req.query.status)
    : null;
  const severityParsed = req.query.severity
    ? z.enum(['critical', 'warning', 'info']).safeParse(req.query.severity)
    : null;
  if (statusParsed && !statusParsed.success || severityParsed && !severityParsed.success) {
    return res.status(400).json({ message: 'Alert filter is invalid.' });
  }
  const [alerts, resources] = await Promise.all([listAlerts(req.user.id, {
    status: statusParsed?.data,
    severity: severityParsed?.data,
  }), listResources(req.user.id)]);
  const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
  const items = await Promise.all(alerts.map((alert) => serializeAlert(alert, resourceMap)));
  return res.json({ items, total: items.length });
});

app.patch('/api/v1/alerts/:id', authMiddleware, async (req, res) => {
  const parsed = alertStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Alert status is invalid.' });
  const current = await findAlert(req.user.id, req.params.id);
  if (!current) return res.status(404).json({ message: 'Alert not found.' });
  const updatedAt = isoNow();
  const changes = {
    status: parsed.data.status,
    updatedAt,
    ...(parsed.data.status === 'acknowledged' ? { acknowledgedAt: updatedAt, resolvedAt: null } : {}),
    ...(parsed.data.status === 'resolved' ? { resolvedAt: updatedAt } : {}),
    ...(parsed.data.status === 'open' ? { acknowledgedAt: null, resolvedAt: null } : {}),
  };
  const alert = await updateAlert(req.user.id, current.id, changes);
  await addEvent(req.user.id, `alert_${parsed.data.status}`, `Alert ${parsed.data.status}: ${alert.title}.`, { alertId: alert.id });
  const resource = await getAuthorizedResource(req.user.id, alert.resourceId);
  return res.json({ ...alert, resourceName: resource?.name || 'Unknown resource' });
});

app.get('/api/v1/alert-rules', authMiddleware, async (req, res) => {
  const items = await listAlertRules(req.user.id);
  return res.json({ items, total: items.length });
});

app.post('/api/v1/alert-rules', authMiddleware, async (req, res) => {
  const parsed = alertRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Alert rule is invalid.' });
  if (parsed.data.resourceId && !(await getAuthorizedResource(req.user.id, parsed.data.resourceId))) {
    return res.status(404).json({ message: 'Resource not found.' });
  }
  const rule = await createAlertRule({
    id: id(),
    userId: req.user.id,
    ...parsed.data,
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });
  await addEvent(req.user.id, 'alert_rule_created', `Created alert rule ${rule.name}.`, { ruleId: rule.id });
  return res.status(201).json(rule);
});

app.patch('/api/v1/alert-rules/:id', authMiddleware, async (req, res) => {
  const parsed = alertRulePatchSchema.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data || {}).length === 0) {
    return res.status(400).json({ message: 'Alert rule update is invalid.' });
  }
  if (parsed.data.resourceId && !(await getAuthorizedResource(req.user.id, parsed.data.resourceId))) {
    return res.status(404).json({ message: 'Resource not found.' });
  }
  const rule = await updateAlertRule(req.user.id, req.params.id, { ...parsed.data, updatedAt: isoNow() });
  if (!rule) return res.status(404).json({ message: 'Alert rule not found.' });
  return res.json(rule);
});

app.delete('/api/v1/alert-rules/:id', authMiddleware, async (req, res) => {
  const rule = await deleteAlertRule(req.user.id, req.params.id);
  if (!rule) return res.status(404).json({ message: 'Alert rule not found.' });
  await addEvent(req.user.id, 'alert_rule_deleted', `Deleted alert rule ${rule.name}.`, { ruleId: rule.id });
  return res.json({ ok: true, deleted: rule.id });
});

app.get('/api/v1/events', authMiddleware, async (req, res) => {
  const items = await listEvents(req.user.id);
  return res.json({ items, total: items.length });
});

app.get('/api/v1/reports/summary', authMiddleware, async (req, res) => {
  try {
    return res.json(await createReport(req.user.id, getReportPeriod(req.query.days)));
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get('/api/v1/reports/export', authMiddleware, async (req, res) => {
  let report;
  try {
    report = await createReport(req.user.id, getReportPeriod(req.query.days));
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  const header = ['record_type', 'resource', 'metric', 'value', 'unit', 'observed_at', 'severity', 'status', 'title', 'created_at', 'resolved_at'];
  const rows = [header.map(csvCell).join(',')];
  for (const resource of report.resources) {
    rows.push(['resource', resource.name, '', '', '', resource.lastPollAt || '', '', resource.status, '', '', ''].map(csvCell).join(','));
  }
  const metrics = await listMetrics(req.user.id, { since: new Date(Date.now() - report.periodDays * 24 * 60 * 60 * 1000) });
  for (const point of metrics) {
    const resource = report.resources.find((item) => item.id === point.resourceId);
    rows.push(['metric', resource?.name || 'Unknown resource', point.metric, point.value, point.unit, point.observedAt, '', '', '', '', ''].map(csvCell).join(','));
  }
  for (const alert of report.alertItems) {
    rows.push(['alert', alert.resourceName, '', '', '', '', alert.severity, alert.status, alert.title, alert.createdAt, alert.resolvedAt || ''].map(csvCell).join(','));
  }
  res.header('Content-Type', 'text/csv; charset=utf-8');
  res.attachment(`sentinel-report-${report.periodDays}d.csv`);
  return res.send(rows.join('\n'));
});

app.get('/api/v1/settings', authMiddleware, async (req, res) => {
  return res.json({ settings: await getSettings(req.user.id), userId: req.user.id });
});

app.patch('/api/v1/settings', authMiddleware, async (req, res) => {
  const parsed = settingsPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Settings are invalid.' });
  const current = await getSettings(req.user.id);
  const next = {
    ...defaultSettings,
    ...current,
    ...parsed.data,
    alertThresholds: { ...current.alertThresholds, ...parsed.data.alertThresholds },
    notifications: { ...current.notifications, ...parsed.data.notifications },
  };
  if (next.alertThresholds.warning >= next.alertThresholds.critical) {
    return res.status(400).json({ message: 'The warning threshold must be lower than the critical threshold.' });
  }
  return res.json({ settings: await saveSettings(req.user.id, next), updatedAt: isoNow() });
});

app.get('/api/v1/notifications', authMiddleware, async (req, res) => {
  return res.json({ items: (await listAlerts(req.user.id)).slice(0, 5) });
});

app.get('/api/v1/profile', authMiddleware, async (req, res) => {
  return res.json({ user: sanitizeUser(req.user), settings: await getSettings(req.user.id) });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'The requested API route was not found.' });
  return next();
});

const distPath = path.join(rootDir, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('Request failed:', error);
  return res.status(500).json({ message: 'The request could not be completed.' });
});

mongoState.connected = (await connectStore()).connected;
mongoState.mode = mongoState.connected ? 'mongodb' : 'demo';
if (!mongoState.connected || process.env.SEED_DEMO_DATA === 'true') await seedDemoData();

export default app;
