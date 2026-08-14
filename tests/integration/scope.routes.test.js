const request = require('supertest');
const { signAccessToken } = require('../../src/utils/jwt');

const mockListActiveScopes = jest.fn();

jest.mock('../../src/services/infrastructure/scopeCatalog.service', () =>
  jest.fn().mockImplementation(() => ({
    listActiveScopes: mockListActiveScopes,
  }))
);

const app = require('../../src/app');

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
  mockListActiveScopes.mockReset();
});

describe('Scope routes integration', () => {
  it('returns active scopes for an authenticated user', async () => {
    const token = buildToken({
      id: 'patient-id-001',
      pseudoId: 'patient-pseudo-001',
      role: 'PATIENT',
    });

    mockListActiveScopes.mockResolvedValue([
      {
        scopeId: '8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2',
        label: 'Control glucemico',
      },
    ]);

    const response = await request(app)
      .get('/scopes')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        scopeId: '8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2',
        label: 'Control glucemico',
      },
    ]);
  });

  it('rejects unauthenticated access to the scope catalog', async () => {
    const response = await request(app).get('/scopes');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Se requiere un token de autenticación.');
    expect(mockListActiveScopes).not.toHaveBeenCalled();
  });
});
