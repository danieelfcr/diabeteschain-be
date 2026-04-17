const request = require('supertest');

const mockGetMyAuditEvents = jest.fn();

jest.mock('../../src/services/orchestration/audit.orchestration.service', () =>
  jest.fn().mockImplementation(() => ({
    getMyAuditEvents: mockGetMyAuditEvents,
  }))
);

const app = require('../../src/app');
const { signAccessToken } = require('../../src/utils/jwt');

const buildToken = ({ id, pseudoId = null, role, professionalId = null }) =>
  signAccessToken({
    sub: id,
    pseudoId,
    role,
    email: `${String(role || 'user').toLowerCase()}@example.com`,
    professionalId,
    username: `${String(role || 'user').toLowerCase()}_user`,
  });

beforeEach(() => {
  mockGetMyAuditEvents.mockReset();
});

describe('Audit routes integration', () => {
  it('permite que un PATIENT consulte GET /audit/me', async () => {
    const token = buildToken({
      id: 'patient-id-001',
      pseudoId: 'patient-pseudo-001',
      role: 'PATIENT',
    });

    mockGetMyAuditEvents.mockResolvedValue({
      data: [
        {
          auditId: 'audit-001',
          docType: 'auditEvent',
          patientId: 'patient-pseudo-001',
          actorId: 'doc-001',
          actorRole: 'doctor',
          action: 'READ_CLINICAL_HISTORY',
          targetType: 'scope',
          targetId: 'labs',
          outcome: 'SUCCESS',
          timestamp: '2026-04-01T11:05:00Z',
        },
      ],
    });

    const response = await request(app)
      .get('/audit/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].action).toBe('READ_CLINICAL_HISTORY');
    expect(mockGetMyAuditEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'patient-id-001',
        pseudoId: 'patient-pseudo-001',
        role: 'PATIENT',
      })
    );
  });

  it('retorna lista vacia cuando el paciente no tiene eventos de auditoria', async () => {
    const token = buildToken({
      id: 'patient-id-002',
      pseudoId: 'patient-pseudo-002',
      role: 'PATIENT',
    });

    mockGetMyAuditEvents.mockResolvedValue({ data: [] });

    const response = await request(app)
      .get('/audit/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });

  it('rechaza con 401 si GET /audit/me no recibe autenticacion', async () => {
    const response = await request(app).get('/audit/me');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication token is required');
    expect(mockGetMyAuditEvents).not.toHaveBeenCalled();
  });

  it('rechaza con 403 si un rol distinto de PATIENT intenta consultar GET /audit/me', async () => {
    const token = buildToken({
      id: 'doctor-id-001',
      role: 'DOCTOR',
      professionalId: 'COL-001',
    });

    const response = await request(app)
      .get('/audit/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden for current role');
    expect(mockGetMyAuditEvents).not.toHaveBeenCalled();
  });
});
