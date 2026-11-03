import mongoose from 'mongoose';
import {
  Alert,
  AlertRule,
  Event,
  Metric,
  Project,
  Dataset,
  DataRecord,
  Resource,
  Task,
  User,
  UserSettings,
} from './models.js';

export const memory = {
  users: [],
  resources: [],
  metrics: [],
  alerts: [],
  events: [],
  alertRules: [],
  settings: new Map(),
  projects: [],
  tasks: [],
  datasets: [],
  dataRecords: [],
};

export const defaultSettings = {
  timezone: 'UTC',
  alertThresholds: { warning: 70, critical: 90 },
  notifications: { email: true, inApp: true, sms: false },
  collectionIntervalMinutes: 5,
  retentionDays: 30,
};

const isMongoReady = () => mongoose.connection.readyState === 1;
const asPlain = (document) => {
  if (!document) return null;
  if (typeof document.toObject === 'function') {
    const plain = document.toObject({ flattenMaps: true });
    delete plain._id;
    delete plain.__v;
    return plain;
  }
  return document;
};
export async function connectStore() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI must be configured in production.');
    }
    return { connected: false, mode: 'demo' };
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || 'sentinel_db',
    serverSelectionTimeoutMS: 10000,
  });
  await Promise.all([
    User.init(),
    Resource.init(),
    Metric.init(),
    Alert.init(),
    Event.init(),
    AlertRule.init(),
    UserSettings.init(),
  ]);
  return { connected: true, mode: 'mongodb' };
}

export async function findUserByEmail(email) {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (isMongoReady()) return asPlain(await User.findOne({ email: normalizedEmail }).lean());
  return memory.users.find((user) => user.email.toLowerCase() === normalizedEmail) || null;
}

export async function findUserById(id) {
  if (isMongoReady()) return asPlain(await User.findOne({ id }).lean());
  return memory.users.find((user) => user.id === id) || null;
}

export async function createUser(user) {
  if (isMongoReady()) return asPlain(await User.create(user));
  memory.users.push(user);
  return user;
}

export async function listResources(ownerId) {
  if (isMongoReady()) return (await Resource.find({ ownerId }).sort({ createdAt: -1 }).lean()).map(asPlain);
  return memory.resources.filter((resource) => resource.ownerId === ownerId);
}

export async function findResource(ownerId, id) {
  if (isMongoReady()) return asPlain(await Resource.findOne({ ownerId, id }).lean());
  return memory.resources.find((resource) => resource.ownerId === ownerId && resource.id === id) || null;
}

export async function createResource(resource) {
  if (isMongoReady()) return asPlain(await Resource.create(resource));
  memory.resources.push(resource);
  return resource;
}

export async function updateResource(ownerId, id, changes) {
  if (isMongoReady()) return asPlain(await Resource.findOneAndUpdate({ ownerId, id }, { $set: changes }, { new: true, runValidators: true }).lean());
  const resource = await findResource(ownerId, id);
  if (!resource) return null;
  Object.assign(resource, changes);
  return resource;
}

export async function deleteResource(ownerId, id) {
  if (isMongoReady()) {
    const deleted = await Resource.findOneAndDelete({ ownerId, id }).lean();
    if (!deleted) return null;
    await Promise.all([
      Metric.deleteMany({ ownerId, resourceId: id }),
      Alert.deleteMany({ userId: ownerId, resourceId: id }),
      AlertRule.deleteMany({ userId: ownerId, resourceId: id }),
    ]);
    return asPlain(deleted);
  }
  const index = memory.resources.findIndex((resource) => resource.ownerId === ownerId && resource.id === id);
  if (index < 0) return null;
  const [deleted] = memory.resources.splice(index, 1);
  memory.metrics = memory.metrics.filter((metric) => metric.resourceId !== id || metric.ownerId !== ownerId);
  memory.alerts = memory.alerts.filter((alert) => alert.resourceId !== id || alert.userId !== ownerId);
  memory.alertRules = memory.alertRules.filter((rule) => rule.resourceId !== id || rule.userId !== ownerId);
  return deleted;
}

export async function createMetrics(items) {
  if (isMongoReady()) return (await Metric.insertMany(items, { ordered: true })).map(asPlain);
  memory.metrics.push(...items);
  return items;
}

export async function listMetrics(ownerId, { resourceId, metric, since, limit } = {}) {
  if (isMongoReady()) {
    const filter = { ownerId };
    if (resourceId) filter.resourceId = resourceId;
    if (metric) filter.metric = metric;
    if (since) filter.observedAt = { $gte: since };
    let query = Metric.find(filter).sort({ observedAt: -1 });
    if (limit) query = query.limit(limit);
    const rows = (await query.lean()).map(asPlain);
    return limit ? rows.reverse() : rows;
  }
  let rows = memory.metrics.filter((item) => item.ownerId === ownerId);
  if (resourceId) rows = rows.filter((item) => item.resourceId === resourceId);
  if (metric) rows = rows.filter((item) => item.metric === metric);
  if (since) rows = rows.filter((item) => new Date(item.observedAt) >= since);
  rows.sort((left, right) => new Date(left.observedAt) - new Date(right.observedAt));
  return limit ? rows.slice(-limit) : rows;
}

export async function listAlerts(userId, { since, status, severity } = {}) {
  if (isMongoReady()) {
    const filter = { userId };
    if (since) filter.createdAt = { $gte: since };
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    return (await Alert.find(filter).sort({ createdAt: -1 }).lean()).map(asPlain);
  }
  return memory.alerts.filter((alert) => alert.userId === userId
    && (!since || new Date(alert.createdAt) >= since)
    && (!status || alert.status === status)
    && (!severity || alert.severity === severity))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

export async function findAlert(userId, id) {
  if (isMongoReady()) return asPlain(await Alert.findOne({ userId, id }).lean());
  return memory.alerts.find((alert) => alert.userId === userId && alert.id === id) || null;
}

export async function findActiveAlert(userId, fingerprint) {
  if (isMongoReady()) return asPlain(await Alert.findOne({ userId, fingerprint, status: { $in: ['open', 'acknowledged'] } }).lean());
  return memory.alerts.find((alert) => alert.userId === userId && alert.fingerprint === fingerprint
    && ['open', 'acknowledged'].includes(alert.status)) || null;
}

export async function createAlert(alert) {
  if (isMongoReady()) return asPlain(await Alert.create(alert));
  memory.alerts.unshift(alert);
  return alert;
}

export async function updateAlert(userId, id, changes, incrementOccurrences = false) {
  if (isMongoReady()) {
    const update = { $set: changes };
    if (incrementOccurrences) update.$inc = { occurrences: 1 };
    return asPlain(await Alert.findOneAndUpdate({ userId, id }, update, { new: true, runValidators: true }).lean());
  }
  const alert = await findAlert(userId, id);
  if (!alert) return null;
  Object.assign(alert, changes);
  if (incrementOccurrences) alert.occurrences = (alert.occurrences || 1) + 1;
  return alert;
}

export async function createEvent(event) {
  if (isMongoReady()) return asPlain(await Event.create(event));
  memory.events.unshift(event);
  return event;
}

export async function listEvents(userId, limit = 20) {
  if (isMongoReady()) return (await Event.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean()).map(asPlain);
  return memory.events.filter((event) => event.userId === userId).slice(0, limit);
}

export async function listAlertRules(userId) {
  if (isMongoReady()) return (await AlertRule.find({ userId }).sort({ createdAt: -1 }).lean()).map(asPlain);
  return memory.alertRules.filter((rule) => rule.userId === userId);
}

export async function findAlertRule(userId, id) {
  if (isMongoReady()) return asPlain(await AlertRule.findOne({ userId, id }).lean());
  return memory.alertRules.find((rule) => rule.userId === userId && rule.id === id) || null;
}

export async function createAlertRule(rule) {
  if (isMongoReady()) return asPlain(await AlertRule.create(rule));
  memory.alertRules.unshift(rule);
  return rule;
}

export async function updateAlertRule(userId, id, changes) {
  if (isMongoReady()) return asPlain(await AlertRule.findOneAndUpdate({ userId, id }, { $set: changes }, { new: true, runValidators: true }).lean());
  const rule = await findAlertRule(userId, id);
  if (!rule) return null;
  Object.assign(rule, changes);
  return rule;
}

export async function deleteAlertRule(userId, id) {
  if (isMongoReady()) return asPlain(await AlertRule.findOneAndDelete({ userId, id }).lean());
  const index = memory.alertRules.findIndex((rule) => rule.userId === userId && rule.id === id);
  if (index < 0) return null;
  return memory.alertRules.splice(index, 1)[0];
}

export async function getSettings(userId) {
  if (isMongoReady()) {
    const record = await UserSettings.findOne({ userId }).lean();
    return record?.settings || structuredClone(defaultSettings);
  }
  return memory.settings.get(userId) || structuredClone(defaultSettings);
}

export async function saveSettings(userId, settings) {
  if (isMongoReady()) {
    const record = await UserSettings.findOneAndUpdate(
      { userId },
      { $set: { settings } },
      { new: true, upsert: true, runValidators: true },
    ).lean();
    return record.settings;
  }
  memory.settings.set(userId, settings);
  return settings;
}

export async function listProjects(userId) {
  if (isMongoReady()) return (await Project.find({ userId }).sort({ updatedAt: -1 }).lean()).map(asPlain);
  return memory.projects.filter((project) => project.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function findProject(userId, id) {
  if (isMongoReady()) return asPlain(await Project.findOne({ userId, id }).lean());
  return memory.projects.find((project) => project.userId === userId && project.id === id) || null;
}

export async function createProject(project) {
  if (isMongoReady()) return asPlain(await Project.create(project));
  memory.projects.unshift(project);
  return project;
}

export async function updateProject(userId, id, changes) {
  if (isMongoReady()) return asPlain(await Project.findOneAndUpdate({ userId, id }, { $set: changes }, { new: true, runValidators: true }).lean());
  const project = await findProject(userId, id);
  if (!project) return null;
  Object.assign(project, changes);
  return project;
}

export async function deleteProject(userId, id) {
  if (isMongoReady()) {
    const deleted = await Project.findOneAndDelete({ userId, id }).lean();
    if (deleted) await Task.deleteMany({ userId, projectId: id });
    return asPlain(deleted);
  }
  const index = memory.projects.findIndex((project) => project.userId === userId && project.id === id);
  if (index < 0) return null;
  const [deleted] = memory.projects.splice(index, 1);
  memory.tasks = memory.tasks.filter((task) => task.userId !== userId || task.projectId !== id);
  return deleted;
}

export async function listTasks(userId, projectId) {
  if (isMongoReady()) return (await Task.find({ userId, projectId }).sort({ dueDate: 1, createdAt: -1 }).lean()).map(asPlain);
  return memory.tasks.filter((task) => task.userId === userId && task.projectId === projectId);
}

export async function findTask(userId, id) {
  if (isMongoReady()) return asPlain(await Task.findOne({ userId, id }).lean());
  return memory.tasks.find((task) => task.userId === userId && task.id === id) || null;
}

export async function createTask(task) {
  if (isMongoReady()) return asPlain(await Task.create(task));
  memory.tasks.push(task);
  return task;
}

export async function updateTask(userId, id, changes) {
  if (isMongoReady()) return asPlain(await Task.findOneAndUpdate({ userId, id }, { $set: changes }, { new: true, runValidators: true }).lean());
  const task = await findTask(userId, id);
  if (!task) return null;
  Object.assign(task, changes);
  return task;
}

export async function deleteTask(userId, id) {
  if (isMongoReady()) return asPlain(await Task.findOneAndDelete({ userId, id }).lean());
  const index = memory.tasks.findIndex((task) => task.userId === userId && task.id === id);
  if (index < 0) return null;
  return memory.tasks.splice(index, 1)[0];
}

export async function listDatasets(userId) {
  if (isMongoReady()) return (await Dataset.find({ userId }).sort({ updatedAt: -1 }).lean()).map(asPlain);
  return memory.datasets.filter((dataset) => dataset.userId === userId);
}

export async function findDataset(userId, id) {
  if (isMongoReady()) return asPlain(await Dataset.findOne({ userId, id }).lean());
  return memory.datasets.find((dataset) => dataset.userId === userId && dataset.id === id) || null;
}

export async function createDataset(dataset) {
  if (isMongoReady()) return asPlain(await Dataset.create(dataset));
  memory.datasets.unshift(dataset);
  return dataset;
}

export async function updateDataset(userId, id, changes) {
  if (isMongoReady()) return asPlain(await Dataset.findOneAndUpdate({ userId, id }, { $set: changes }, { new: true, runValidators: true }).lean());
  const dataset = await findDataset(userId, id);
  if (!dataset) return null;
  Object.assign(dataset, changes);
  return dataset;
}

export async function deleteDataset(userId, id) {
  if (isMongoReady()) {
    const deleted = await Dataset.findOneAndDelete({ userId, id }).lean();
    if (deleted) await DataRecord.deleteMany({ userId, datasetId: id });
    return asPlain(deleted);
  }
  const index = memory.datasets.findIndex((dataset) => dataset.userId === userId && dataset.id === id);
  if (index < 0) return null;
  const [deleted] = memory.datasets.splice(index, 1);
  memory.dataRecords = memory.dataRecords.filter((record) => record.userId !== userId || record.datasetId !== id);
  return deleted;
}

export async function listDataRecords(userId, datasetId) {
  if (isMongoReady()) return (await DataRecord.find({ userId, datasetId }).sort({ recordedAt: -1 }).lean()).map(asPlain);
  return memory.dataRecords.filter((record) => record.userId === userId && record.datasetId === datasetId);
}

export async function findDataRecord(userId, id) {
  if (isMongoReady()) return asPlain(await DataRecord.findOne({ userId, id }).lean());
  return memory.dataRecords.find((record) => record.userId === userId && record.id === id) || null;
}

export async function createDataRecord(record) {
  if (isMongoReady()) return asPlain(await DataRecord.create(record));
  memory.dataRecords.unshift(record);
  return record;
}

export async function updateDataRecord(userId, id, changes) {
  if (isMongoReady()) return asPlain(await DataRecord.findOneAndUpdate({ userId, id }, { $set: changes }, { new: true, runValidators: true }).lean());
  const record = await findDataRecord(userId, id);
  if (!record) return null;
  Object.assign(record, changes);
  return record;
}

export async function deleteDataRecord(userId, id) {
  if (isMongoReady()) return asPlain(await DataRecord.findOneAndDelete({ userId, id }).lean());
  const index = memory.dataRecords.findIndex((record) => record.userId === userId && record.id === id);
  if (index < 0) return null;
  return memory.dataRecords.splice(index, 1)[0];
}

export function mongoConnected() {
  return isMongoReady();
}
