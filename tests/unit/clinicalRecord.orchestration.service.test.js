jest.mock('../../src/repositories/clinicalRecord.repository', () => ({}));
jest.mock('../../src/repositories/fabricClinicalRecord.repository', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../src/repositories/fabricPermission.repository', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../src/repositories/identity.repository', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../src/clients/preServiceClient', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../src/services/infrastructure/scopeCatalog.service', () => jest.fn().mockImplementation(() => ({})));

const ClinicalRecordOrchestrationService = require('../../src/services/orchestration/clinicalRecord.orchestration.service');

describe('ClinicalRecordOrchestrationService ScopeMaterial handling', () => {
  it('rejects clinical writes when the patient has not initialized ScopeMaterial', async () => {
    const service = new ClinicalRecordOrchestrationService();
    service.fabricClinicalRecordRepository = {
      getScopeMaterialByPatientAndScope: jest.fn().mockResolvedValue(null),
      createScopeMaterial: jest.fn(),
    };

    await expect(service.resolveScopeMaterialForRecord({
      patientPseudoId: 'patient-001',
      scopeId: 'scope-001',
    })).rejects.toThrow(
      'ScopeMaterial must be initialized by the patient before registering clinical records for this scope'
    );

    expect(service.fabricClinicalRecordRepository.createScopeMaterial).not.toHaveBeenCalled();
  });

  it('reuses existing ScopeMaterial without requiring request material', async () => {
    const service = new ClinicalRecordOrchestrationService();
    service.fabricClinicalRecordRepository = {
      getScopeMaterialByPatientAndScope: jest.fn().mockResolvedValue({
        scopeMaterialId: 'smat-existing',
        patientPseudoId: 'patient-001',
        scopeId: 'scope-001',
        encryptedScopeKey: 'encrypted-scope-key',
        metadata: {
          encryptedScopeKeyEncoding: 'base64',
        },
        status: 'ACTIVE',
      }),
      createScopeMaterial: jest.fn(),
    };

    const result = await service.resolveScopeMaterialForRecord({
      patientPseudoId: 'patient-001',
      scopeId: 'scope-001',
    });

    expect(service.fabricClinicalRecordRepository.createScopeMaterial).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      scopeMaterialCreated: false,
      scopeMaterial: {
        scopeMaterialId: 'smat-existing',
      },
    });
  });
});

describe('ClinicalRecordOrchestrationService PRE proxy fallback', () => {
  it('tries ScopeMaterial proxyIds in order until one transforms the scope key', async () => {
    const service = new ClinicalRecordOrchestrationService();
    service.proxyNodeService = {
      getProxyNodesByIds: jest.fn().mockResolvedValue([
        {
          id: 'proxy-a',
          endpointUrl: 'http://proxy-a.local:4100',
        },
        {
          id: 'proxy-b',
          endpointUrl: 'http://proxy-b.local:4100',
        },
      ]),
    };
    service.preServiceClient = {
      transformScopeKey: jest.fn()
        .mockRejectedValueOnce(new Error('proxy-a unavailable'))
        .mockResolvedValueOnce({
          scopeId: 'scope-001',
          transformedScopeKey: 'transformed-scope-key',
          metadata: {
            proxyNodeId: 'proxy-b',
          },
        }),
    };

    const result = await service.transformScopeKeyWithProxyFallback({
      permissionId: 'permission-001',
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      scopeId: 'scope-001',
      encryptedScopeKey: 'encrypted-scope-key',
      encryptedScopeKeyEncoding: 'base64',
      proxyIds: ['proxy-a', 'proxy-b'],
    });

    expect(service.proxyNodeService.getProxyNodesByIds).toHaveBeenCalledWith(['proxy-a', 'proxy-b']);
    expect(service.preServiceClient.transformScopeKey).toHaveBeenCalledTimes(2);
    expect(service.preServiceClient.transformScopeKey.mock.calls[0][0]).toMatchObject({
      baseUrl: 'http://proxy-a.local:4100',
      proxyNodeId: 'proxy-a',
      encryptedScopeKeyEncoding: 'base64',
    });
    expect(service.preServiceClient.transformScopeKey.mock.calls[1][0]).toMatchObject({
      baseUrl: 'http://proxy-b.local:4100',
      proxyNodeId: 'proxy-b',
    });
    expect(result.transformedScopeKey).toBe('transformed-scope-key');
  });
});

describe('ClinicalRecordOrchestrationService professional history material', () => {
  it('returns transformed scope material for authorized scopes even when the patient has no records', async () => {
    const service = new ClinicalRecordOrchestrationService();
    service.identityRepository = {
      findUserByUsername: jest.fn(async (username) => {
        if (username === 'pac') {
          return {
            username: 'pac',
            pseudoId: 'patient-001',
            role: 'PATIENT',
          };
        }

        if (username === 'med') {
          return {
            id: 'professional-001',
            username: 'med',
            role: 'DOCTOR',
          };
        }

        return null;
      }),
    };
    service.fabricPermissionRepository = {
      getActivePermissionsByPatientAndGrantee: jest.fn().mockResolvedValue([
        {
          permissionId: 'permission-001',
          allowedScopes: ['scope-a', 'scope-b'],
          allowedActions: ['read', 'write'],
          validFrom: '2026-01-01T00:00:00.000Z',
          validTo: '2099-01-01T00:00:00.000Z',
          status: 'ACTIVE',
        },
      ]),
    };
    service.scopeCatalogService = {
      listActiveScopeIds: jest.fn().mockResolvedValue(['scope-a', 'scope-b', 'scope-c']),
    };
    service.fabricClinicalRecordRepository = {
      getPatientRecordIndexesWithAudit: jest.fn().mockResolvedValue([]),
      getScopeMaterialsByPatientAndScopes: jest.fn().mockResolvedValue([
        {
          scopeMaterialId: 'smat-a',
          patientPseudoId: 'patient-001',
          scopeId: 'scope-a',
          encryptedScopeKey: 'encrypted-a',
          encryptedScopeKeyEncoding: 'base64',
          proxyIds: ['proxy-a'],
          status: 'ACTIVE',
        },
        {
          scopeMaterialId: 'smat-b',
          patientPseudoId: 'patient-001',
          scopeId: 'scope-b',
          encryptedScopeKey: 'encrypted-b',
          encryptedScopeKeyEncoding: 'base64',
          proxyIds: ['proxy-b'],
          status: 'ACTIVE',
        },
      ]),
    };
    service.clinicalRecordRepository = {
      getClinicalRecordsByReferences: jest.fn(),
    };
    service.transformScopeKeyWithProxyFallback = jest.fn(async ({ scopeId }) => ({
      scopeId,
      transformedScopeKey: `transformed-${scopeId}`,
      metadata: {
        transformedScopeKeyEncoding: 'base64',
        proxyNodeId: `proxy-${scopeId}`,
      },
    }));

    const result = await service.getProfessionalHistory(
      { patientUsername: 'pac' },
      { username: 'med', role: 'DOCTOR' }
    );

    expect(service.fabricClinicalRecordRepository.getPatientRecordIndexesWithAudit).toHaveBeenCalledWith({
      patientPseudoId: 'patient-001',
      professionalId: 'professional-001',
      professionalRole: 'DOCTOR',
    });
    expect(service.clinicalRecordRepository.getClinicalRecordsByReferences).not.toHaveBeenCalled();
    expect(service.fabricClinicalRecordRepository.getScopeMaterialsByPatientAndScopes).toHaveBeenCalledWith(
      'patient-001',
      ['scope-a', 'scope-b']
    );
    expect(service.transformScopeKeyWithProxyFallback).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      action: 'get_professional_history',
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      totalRecords: 0,
      effectiveScopes: ['scope-a', 'scope-b'],
      records: [],
      scopes: [
        {
          scopeId: 'scope-a',
          transformedScopeKey: 'transformed-scope-a',
          scopeMaterialId: 'smat-a',
          records: [],
        },
        {
          scopeId: 'scope-b',
          transformedScopeKey: 'transformed-scope-b',
          scopeMaterialId: 'smat-b',
          records: [],
        },
      ],
    });
  });
});
