import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';

describe('Sentinel API', () => {
  it('returns health payload', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('registers a new user', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Tester User', email: 'tester@example.com', password: 'StrongPass123!' });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('tester@example.com');
  });

  it('logs in and reads dashboard summary', async () => {
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'demo@sentinel.local', password: 'Admin123!' });

    expect(loginResponse.status).toBe(200);
    const summaryResponse = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Cookie', loginResponse.headers['set-cookie'][0].split(';')[0]);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.totalResources).toBeGreaterThan(0);
  });

  it('evaluates consecutive metric checks and reports incidents', async () => {
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'demo@sentinel.local', password: 'Admin123!' });
    const cookie = loginResponse.headers['set-cookie'][0].split(';')[0];
    const resourcesResponse = await request(app).get('/api/v1/resources').set('Cookie', cookie);
    const resourceId = resourcesResponse.body.items[0].id;

    const ruleResponse = await request(app)
      .post('/api/v1/alert-rules')
      .set('Cookie', cookie)
      .send({
        name: 'High response time',
        resourceId,
        metric: 'response_time',
        operator: 'gt',
        threshold: 500,
        severity: 'critical',
        consecutiveChecks: 2,
        cooldownMinutes: 15,
      });
    expect(ruleResponse.status).toBe(201);

    const disabledRule = await request(app)
      .patch(`/api/v1/alert-rules/${ruleResponse.body.id}`)
      .set('Cookie', cookie)
      .send({ enabled: false });
    expect(disabledRule.status).toBe(200);
    expect(disabledRule.body.enabled).toBe(false);
    await request(app)
      .patch(`/api/v1/alert-rules/${ruleResponse.body.id}`)
      .set('Cookie', cookie)
      .send({ enabled: true });

    for (let index = 0; index < 2; index += 1) {
      const metricResponse = await request(app)
        .post(`/api/v1/resources/${resourceId}/metrics`)
        .set('Cookie', cookie)
        .send({ metric: 'response_time', value: 750, unit: 'ms' });
      expect(metricResponse.status).toBe(201);
    }

    const alertsResponse = await request(app).get('/api/v1/alerts?severity=critical').set('Cookie', cookie);
    expect(alertsResponse.body.items).toHaveLength(1);
    expect(alertsResponse.body.items[0].details.consecutiveChecks).toBe(2);

    await request(app)
      .post(`/api/v1/resources/${resourceId}/metrics`)
      .set('Cookie', cookie)
      .send({ metric: 'response_time', value: 800, unit: 'ms' });
    const deduplicatedAlerts = await request(app).get('/api/v1/alerts?severity=critical').set('Cookie', cookie);
    expect(deduplicatedAlerts.body.items).toHaveLength(1);
    expect(deduplicatedAlerts.body.items[0].occurrences).toBe(2);

    const alertId = deduplicatedAlerts.body.items[0].id;
    const acknowledged = await request(app)
      .patch(`/api/v1/alerts/${alertId}`)
      .set('Cookie', cookie)
      .send({ status: 'acknowledged' });
    const resolved = await request(app)
      .patch(`/api/v1/alerts/${alertId}`)
      .set('Cookie', cookie)
      .send({ status: 'resolved' });
    expect(acknowledged.body.status).toBe('acknowledged');
    expect(resolved.body.status).toBe('resolved');

    const reportResponse = await request(app).get('/api/v1/reports/summary?days=7').set('Cookie', cookie);
    expect(reportResponse.status).toBe(200);
    expect(reportResponse.body.bySeverity.critical).toBe(1);
    expect(reportResponse.body.byStatus.resolved).toBe(1);
    expect(reportResponse.body.metricStats.response_time.samples).toBeGreaterThanOrEqual(3);

    const exportResponse = await request(app).get('/api/v1/reports/export?days=7').set('Cookie', cookie);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.text).toContain('"High response time"');
  });

  it('rejects invalid report periods and unsafe settings', async () => {
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'demo@sentinel.local', password: 'Admin123!' });
    const cookie = loginResponse.headers['set-cookie'][0].split(';')[0];

    const reportResponse = await request(app).get('/api/v1/reports/summary?days=365').set('Cookie', cookie);
    const settingsResponse = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', cookie)
      .send({ alertThresholds: { warning: 95, critical: 80 } });

    expect(reportResponse.status).toBe(400);
    expect(settingsResponse.status).toBe(400);
  });
});
