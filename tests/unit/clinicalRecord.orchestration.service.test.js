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
