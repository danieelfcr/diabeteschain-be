const GrantAccessDTO = require('../../src/models/api/permissions/grant-access.dto');

describe('GrantAccessDTO', () => {
  const buildPayload = (overrides = {}) => ({
    professionalUsername: 'doctor_user',
    allowedScopes: ['scope-001'],
    allowedActions: ['read'],
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2026-12-31T23:59:59.000Z',
    signature: 'grant-signature',
    transformKeys: [
      {
        scopeId: 'scope-001',
        transformKey: 'transform-key-001',
        transformKeyEncoding: 'base64',
      },
    ],
    ...overrides,
  });

  it('normalizes transform keys for the flat grant contract', () => {
    const dto = GrantAccessDTO.from(buildPayload());

    expect(dto.transformKeys).toEqual([
      {
        scopeId: 'scope-001',
        transformKey: 'transform-key-001',
        transformKeyEncoding: 'base64',
        metadata: {},
      },
    ]);
  });

  it('rejects client-supplied proxy node identifiers', () => {
    expect(() => GrantAccessDTO.from(buildPayload({
      transformKeys: [
        {
          scopeId: 'scope-001',
          transformKey: 'transform-key-001',
          proxyNodeId: 'proxy-001',
        },
      ],
    }))).toThrow('Field transformKeys[0].proxyNodeId is not allowed');
  });

  it('requires transform key encoding', () => {
    expect(() => GrantAccessDTO.from(buildPayload({
      transformKeys: [
        {
          scopeId: 'scope-001',
          transformKey: 'transform-key-001',
        },
      ],
    }))).toThrow('Missing required field: transformKeys[0].transformKeyEncoding');
  });

  it('normalizes patient-provided scope materials for eager creation', () => {
    const dto = GrantAccessDTO.from(buildPayload({
      scopeMaterials: [
        {
          scopeId: 'scope-001',
          encryptedScopeKey: 'encrypted-scope-key',
          encryptedScopeKeyEncoding: 'base64',
        },
      ],
    }));

    expect(dto.scopeMaterials).toEqual([
      {
        scopeId: 'scope-001',
        encryptedScopeKey: 'encrypted-scope-key',
        encryptedScopeKeyEncoding: 'base64',
        recryptMetadata: {},
        metadata: {},
      },
    ]);
  });

  it('accepts the nested permission contract', () => {
    const dto = GrantAccessDTO.from({
      permission: {
        granteeId: 'doctor-001',
        granteeRole: 'DOCTOR',
        allowedScopes: ['scope-001'],
        allowedActions: ['READ'],
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T23:59:59.000Z',
        signature: 'grant-signature',
      },
      transformKeys: [
        {
          scopeId: 'scope-001',
          transformKey: 'transform-key-001',
          transformKeyEncoding: 'base64',
        },
      ],
    });

    expect(dto.granteeId).toBe('doctor-001');
    expect(dto.granteeRole).toBe('DOCTOR');
    expect(dto.transformKeys[0].scopeId).toBe('scope-001');
  });

  it('requires a transform key for every requested scope', () => {
    expect(() => GrantAccessDTO.from(buildPayload({
      allowedScopes: ['scope-001', 'scope-002'],
    }))).toThrow('A transformKey is required for each allowed scope');
  });

  it('rejects malformed scope material entries', () => {
    expect(() => GrantAccessDTO.from(buildPayload({
      scopeMaterials: [
        {
          scopeId: 'scope-001',
        },
      ],
    }))).toThrow('Missing required field: scopeMaterials[0].encryptedScopeKey');
  });

  it('requires encrypted scope key encoding', () => {
    expect(() => GrantAccessDTO.from(buildPayload({
      scopeMaterials: [
        {
          scopeId: 'scope-001',
          encryptedScopeKey: 'encrypted-scope-key',
        },
      ],
    }))).toThrow('Missing required field: scopeMaterials[0].encryptedScopeKeyEncoding');
  });
});
