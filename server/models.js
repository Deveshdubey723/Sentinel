import mongoose from 'mongoose';

const { Schema } = mongoose;

const userSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'user' },
}, { timestamps: true });

const resourceSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  ownerId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  description: { type: String, default: '' },
  endpoint: { type: String, default: '' },
  status: { type: String, default: 'sample' },
  lastPollAt: { type: Date, default: null },
}, { timestamps: true });
resourceSchema.index({ ownerId: 1, createdAt: -1 });

const metricSchema = new Schema({
  id: { type: String, required: true, unique: true },
  ownerId: { type: String, required: true },
  resourceId: { type: String, required: true },
  metric: { type: String, required: true },
  value: { type: Number, required: true },
  unit: { type: String, default: '' },
  observedAt: { type: Date, required: true, index: true },
  source: { type: String, default: 'agent' },
}, { timestamps: true });
metricSchema.index({ ownerId: 1, resourceId: 1, metric: 1, observedAt: -1 });

const alertSchema = new Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  resourceId: { type: String, required: true },
  ruleId: { type: String, default: null },
  fingerprint: { type: String, default: null },
  severity: { type: String, enum: ['critical', 'warning', 'info'], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' },
  occurrences: { type: Number, default: 1 },
  details: { type: Schema.Types.Mixed, default: {} },
  acknowledgedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  lastTriggeredAt: { type: Date, default: Date.now },
}, { timestamps: true });
alertSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ userId: 1, fingerprint: 1, status: 1 });

const eventSchema = new Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  type: { type: String, required: true },
  message: { type: String, required: true },
  details: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});
eventSchema.index({ userId: 1, createdAt: -1 });

const alertRuleSchema = new Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  resourceId: { type: String, default: '' },
  name: { type: String, required: true },
  metric: { type: String, enum: ['cpu', 'memory', 'response_time', 'error_rate'], required: true },
  operator: { type: String, enum: ['gt', 'gte', 'lt', 'lte'], required: true },
  threshold: { type: Number, required: true },
  severity: { type: String, enum: ['critical', 'warning', 'info'], required: true },
  consecutiveChecks: { type: Number, min: 1, max: 20, default: 1 },
  cooldownMinutes: { type: Number, min: 1, max: 1440, default: 15 },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });
alertRuleSchema.index({ userId: 1, enabled: 1 });

const settingsSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  settings: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });

const projectSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  projectName: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'General' },
  startDate: { type: Date, default: null },
  deadline: { type: Date, default: null },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  status: { type: String, enum: ['planned', 'active', 'completed', 'on_hold'], default: 'planned' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  manualProgress: { type: Boolean, default: false },
}, { timestamps: true });
projectSchema.index({ userId: 1, updatedAt: -1 });

const taskSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  projectId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' },
  dueDate: { type: Date, default: null },
}, { timestamps: true });
taskSchema.index({ userId: 1, projectId: 1, updatedAt: -1 });

const datasetSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  datasetName: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'General' },
  fields: { type: [String], default: [] },
}, { timestamps: true });
datasetSchema.index({ userId: 1, updatedAt: -1 });

const dataRecordSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  datasetId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  values: { type: Schema.Types.Mixed, required: true },
  recordedAt: { type: Date, default: Date.now },
}, { timestamps: true });
dataRecordSchema.index({ userId: 1, datasetId: 1, recordedAt: -1 });

export const User = mongoose.models.SentinelUser || mongoose.model('SentinelUser', userSchema);
export const Resource = mongoose.models.SentinelResource || mongoose.model('SentinelResource', resourceSchema);
export const Metric = mongoose.models.SentinelMetric || mongoose.model('SentinelMetric', metricSchema);
export const Alert = mongoose.models.SentinelAlert || mongoose.model('SentinelAlert', alertSchema);
export const Event = mongoose.models.SentinelEvent || mongoose.model('SentinelEvent', eventSchema);
export const AlertRule = mongoose.models.SentinelAlertRule || mongoose.model('SentinelAlertRule', alertRuleSchema);
export const UserSettings = mongoose.models.SentinelSettings || mongoose.model('SentinelSettings', settingsSchema);
export const Project = mongoose.models.SentinelProject || mongoose.model('SentinelProject', projectSchema);
export const Task = mongoose.models.SentinelTask || mongoose.model('SentinelTask', taskSchema);
export const Dataset = mongoose.models.SentinelDataset || mongoose.model('SentinelDataset', datasetSchema);
export const DataRecord = mongoose.models.SentinelDataRecord || mongoose.model('SentinelDataRecord', dataRecordSchema);
