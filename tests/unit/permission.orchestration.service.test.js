const PermissionOrchestrationService = require('../../src/services/orchestration/permission.orchestration.service');

describe('PermissionOrchestrationService grantAccess', () => {
  it('persists capsuleByScope in Fabric using the chaincode field name', async () => {
    const service = new PermissionOrchestrationService();
    const allowedScopes = ['scope-001'];
    const capsuleByScope = {
      'scope-001': {
        format: 'umbral-capsule/base64',
        value: 'base64-scope-capsule',
      },
    };
    const selectedProxies = Array.from({ length: 5 }, (_, index) => ({
      id: `proxy-${index + 1}`,
      endpoint: `http://proxy-${index + 1}.local:5001`,
    }));

    service.identityRepository = {
      findUserByPseudoId: jest.fn().mockResolvedValue({
        id: 'patient-user-001',
        pseudoId: 'patient-001',
        publicKey: 'patient-public-key',
      }),
      findUserById: jest.fn().mockResolvedValue({
        id: 'professional-001',
        role: { name: 'DOCTOR' },
      }),
      verifySignature: jest.fn().mockReturnValue(true),
    };
    service.scopeCatalogService = {
      assertActiveScopeIds: jest.fn().mockResolvedValue(allowedScopes),
    };
    service.proxyNodeService = {
      selectRandomProxyNodes: jest.fn().mockResolvedValue(selectedProxies),
    };
    service.proxyReencryptionClient = {
      distributeKFrags: jest.fn().mockResolvedValue({ id: 'delegation-001' }),
      updateKFragDistributionStatus: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    };
    service.fabricPermissionRepository = {
      grantAccess: jest.fn().mockResolvedValue({ permissionId: 'permission-001' }),
    };

    await service.grantAccess({
      professionalId: 'professional-001',
      allowedScopes,
      allowedActions: ['read'],
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-12-31T23:59:59.000Z',
      signature: 'grant-signature',
      kfrags: ['kfrag-1', 'kfrag-2', 'kfrag-3', 'kfrag-4', 'kfrag-5'],
      enc_k_scope_by_scope: {
        'scope-001': 'encrypted-scope-key',
      },
      capsuleByScope,
    }, {
      id: 'patient-user-001',
      pseudoId: 'patient-001',
      role: 'PATIENT',
    });

    const fabricPayload = service.fabricPermissionRepository.grantAccess.mock.calls[0][0];
    expect(fabricPayload).toMatchObject({
      patientId: 'patient-001',
      granteeId: 'professional-001',
      allowedScopes,
      enc_k_scope_by_scope: {
        'scope-001': 'encrypted-scope-key',
      },
      capsuleByScope,
    });
    expect(fabricPayload).not.toHaveProperty('capsule');
  });
});
