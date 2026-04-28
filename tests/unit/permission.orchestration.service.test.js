const PermissionOrchestrationService = require('../../src/services/orchestration/permission.orchestration.service');

describe('PermissionOrchestrationService grantAccess', () => {
  it('creates missing ScopeMaterial, registers Permission in Fabric, and registers transformKey in the PRE service', async () => {
    const service = new PermissionOrchestrationService();
    const allowedScopes = ['scope-001'];

    service.identityRepository = {
      findUserByUsername: jest.fn()
        .mockResolvedValueOnce({
          id: 'patient-user-001',
          pseudoId: 'patient-001',
          username: 'patient_user',
          publicKey: 'patient-public-key',
          role: { name: 'PATIENT' },
        })
        .mockResolvedValueOnce({
          id: 'professional-001',
          username: 'doctor_user',
          role: { name: 'DOCTOR' },
        }),
      verifySignature: jest.fn().mockReturnValue(true),
    };
    service.scopeCatalogService = {
      assertActiveScopeIds: jest.fn().mockResolvedValue(allowedScopes),
    };
    service.preServiceClient = {
      registerTransformKey: jest.fn().mockResolvedValue({
        scopeId: 'scope-001',
        status: 'REGISTERED',
      }),
    };
    service.fabricPermissionRepository = {
      grantAccess: jest.fn().mockResolvedValue({
        permission: { permissionId: 'permission-001' },
        txId: 'tx-permission-001',
      }),
    };
    service.fabricClinicalRecordRepository = {
      getScopeMaterialByPatientAndScope: jest.fn().mockResolvedValue(null),
      createScopeMaterial: jest.fn().mockResolvedValue({
        scopeMaterial: {
          scopeMaterialId: 'smat-001',
          patientPseudoId: 'patient-001',
          scopeId: 'scope-001',
          encryptedScopeKey: 'encrypted-scope-key',
          status: 'ACTIVE',
        },
        txId: 'tx-scope-material-001',
      }),
    };

    const result = await service.grantAccess({
      professionalUsername: 'doctor_user',
      allowedScopes,
      allowedActions: ['read'],
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-12-31T23:59:59.000Z',
      signature: 'grant-signature',
      transformKeys: [
        {
          scopeId: 'scope-001',
          transformKey: 'transform-key-001',
        },
      ],
      scopeMaterials: [
        {
          scopeId: 'scope-001',
          encryptedScopeKey: 'encrypted-scope-key',
        },
      ],
    }, {
      id: 'patient-user-001',
      pseudoId: 'patient-001',
      username: 'patient_user',
      role: 'PATIENT',
    });

    expect(service.identityRepository.verifySignature.mock.calls[0][0].payload).toMatchObject({
      patientUsername: 'patient_user',
      professionalUsername: 'doctor_user',
    });

    expect(service.fabricPermissionRepository.grantAccess).toHaveBeenCalledWith(expect.objectContaining({
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      allowedScopes,
      allowedActions: ['read'],
    }));

    const fabricPayload = service.fabricPermissionRepository.grantAccess.mock.calls[0][0];
    expect(fabricPayload).not.toHaveProperty('encryptedScopeKey');
    expect(fabricPayload).not.toHaveProperty('scopeMaterial');

    expect(service.fabricClinicalRecordRepository.createScopeMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        patientPseudoId: 'patient-001',
        scopeId: 'scope-001',
        encryptedScopeKey: 'encrypted-scope-key',
        status: 'ACTIVE',
        metadata: expect.objectContaining({
          source: 'PATIENT_GRANT',
        }),
      })
    );

    expect(service.preServiceClient.registerTransformKey).toHaveBeenCalledWith(expect.objectContaining({
      permissionId: 'permission-001',
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      scopeId: 'scope-001',
      transformKey: 'transform-key-001',
    }));

    expect(result).toMatchObject({
      success: true,
      permissionId: 'permission-001',
      transformKeysRegistered: [
        {
          scopeId: 'scope-001',
          status: 'REGISTERED',
        },
      ],
      scopeMaterials: [
        {
          scopeId: 'scope-001',
          scopeMaterialId: 'smat-001',
          created: true,
          status: 'ACTIVE',
          txId: 'tx-scope-material-001',
        },
      ],
    });
  });

  it('requires patient-provided encryptedScopeKey when a granted scope has no ScopeMaterial', async () => {
    const service = new PermissionOrchestrationService();
    const allowedScopes = ['scope-001'];

    service.identityRepository = {
      findUserByUsername: jest.fn()
        .mockResolvedValueOnce({
          id: 'patient-user-001',
          pseudoId: 'patient-001',
          username: 'patient_user',
          publicKey: 'patient-public-key',
          role: { name: 'PATIENT' },
        })
        .mockResolvedValueOnce({
          id: 'professional-001',
          username: 'doctor_user',
          role: { name: 'DOCTOR' },
        }),
      verifySignature: jest.fn().mockReturnValue(true),
    };
    service.scopeCatalogService = {
      assertActiveScopeIds: jest.fn().mockResolvedValue(allowedScopes),
    };
    service.fabricClinicalRecordRepository = {
      getScopeMaterialByPatientAndScope: jest.fn().mockResolvedValue(null),
      createScopeMaterial: jest.fn(),
    };
    service.fabricPermissionRepository = {
      grantAccess: jest.fn(),
    };
    service.preServiceClient = {
      registerTransformKey: jest.fn(),
    };

    await expect(service.grantAccess({
      professionalUsername: 'doctor_user',
      allowedScopes,
      allowedActions: ['read'],
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-12-31T23:59:59.000Z',
      signature: 'grant-signature',
      transformKeys: [
        {
          scopeId: 'scope-001',
          transformKey: 'transform-key-001',
        },
      ],
    }, {
      id: 'patient-user-001',
      pseudoId: 'patient-001',
      username: 'patient_user',
      role: 'PATIENT',
    })).rejects.toThrow('scopeMaterials.encryptedScopeKey is required for scopes without ScopeMaterial: scope-001');

    expect(service.fabricClinicalRecordRepository.createScopeMaterial).not.toHaveBeenCalled();
    expect(service.fabricPermissionRepository.grantAccess).not.toHaveBeenCalled();
    expect(service.preServiceClient.registerTransformKey).not.toHaveBeenCalled();
  });
});

describe('PermissionOrchestrationService getScopeMaterialPreflight', () => {
  it('returns existing and missing scope material status for the authenticated patient', async () => {
    const service = new PermissionOrchestrationService();
    const requestedScopes = ['scope-001', 'scope-002'];

    service.identityRepository = {
      findUserByUsername: jest.fn().mockResolvedValue({
        id: 'patient-user-001',
        pseudoId: 'patient-001',
        username: 'patient_user',
        role: { name: 'PATIENT' },
      }),
    };
    service.scopeCatalogService = {
      assertActiveScopeIds: jest.fn().mockResolvedValue(requestedScopes),
    };
    service.fabricClinicalRecordRepository = {
      getScopeMaterialsByPatientAndScopes: jest.fn().mockResolvedValue([
        {
          scopeMaterialId: 'smat-001',
          patientPseudoId: 'patient-001',
          scopeId: 'scope-001',
          encryptedScopeKey: 'encrypted-scope-key-001',
          status: 'ACTIVE',
          version: 1,
          metadata: {
            scheme: 'RECRYPT',
          },
        },
      ]),
    };

    const result = await service.getScopeMaterialPreflight({
      scopeIds: requestedScopes,
    }, {
      id: 'patient-user-001',
      pseudoId: 'patient-001',
      username: 'patient_user',
      role: 'PATIENT',
    });

    expect(service.scopeCatalogService.assertActiveScopeIds).toHaveBeenCalledWith(requestedScopes);
    expect(service.fabricClinicalRecordRepository.getScopeMaterialsByPatientAndScopes)
      .toHaveBeenCalledWith('patient-001', requestedScopes);

    expect(result).toMatchObject({
      success: true,
      action: 'scope_material_preflight',
      existingScopes: ['scope-001'],
      missingScopes: ['scope-002'],
      scopeMaterials: [
        {
          scopeId: 'scope-001',
          exists: true,
          scopeMaterialId: 'smat-001',
          encryptedScopeKey: 'encrypted-scope-key-001',
          status: 'ACTIVE',
          version: 1,
          metadata: {
            scheme: 'RECRYPT',
          },
        },
        {
          scopeId: 'scope-002',
          exists: false,
          scopeMaterialId: null,
          encryptedScopeKey: null,
          status: null,
          version: null,
          metadata: {},
        },
      ],
    });
  });
});
