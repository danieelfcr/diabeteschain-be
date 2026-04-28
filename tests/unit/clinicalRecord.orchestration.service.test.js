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
