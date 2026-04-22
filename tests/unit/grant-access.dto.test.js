const GrantAccessDTO = require('../../src/models/api/permissions/grant-access.dto');

describe('GrantAccessDTO', () => {
  const buildPayload = (overrides = {}) => ({
    professionalId: 'professional-001',
    allowedScopes: ['scope-001'],
    allowedActions: ['read'],
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2026-12-31T23:59:59.000Z',
    signature: 'grant-signature',
    kfrags: ['kfrag-001'],
    capsuleByScope: {
      'scope-001': ' base64-scope-capsule ',
    },
    ...overrides,
  });

  it('preserves and normalizes capsuleByScope for Fabric scope material', () => {
    const dto = GrantAccessDTO.from(buildPayload());

    expect(dto.capsuleByScope).toEqual({
      'scope-001': 'base64-scope-capsule',
    });
  });

  it('requires a capsule for every requested scope', () => {
    expect(() => GrantAccessDTO.from(buildPayload({
      allowedScopes: ['scope-001', 'scope-002'],
      capsuleByScope: {
        'scope-001': 'base64-scope-capsule',
      },
    }))).toThrow('Missing capsuleByScope entries for scopes: scope-002');
  });
});
