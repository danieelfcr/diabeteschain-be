jest.mock('../../src/repositories/clinicalRecord.repository', () => ({}));
jest.mock('../../src/repositories/fabricClinicalRecord.repository', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../src/repositories/fabricPermission.repository', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../src/repositories/identity.repository', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../src/clients/proxyReencryption/proxyReencryption.client', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../src/services/infrastructure/scopeCatalog.service', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../src/services/infrastructure/proxyNode.service', () => jest.fn().mockImplementation(() => ({})));

const ClinicalRecordOrchestrationService = require('../../src/services/orchestration/clinicalRecord.orchestration.service');
const { normalizeScopeMaterials } = require('../../src/utils/clinicalRecord.utils');

describe('ClinicalRecordOrchestrationService PRE capsule helpers', () => {
  it('preserves blockchain capsules from normalized scope materials and enriches references by scopeId', () => {
    const service = new ClinicalRecordOrchestrationService();
    const scopeMaterials = normalizeScopeMaterials([
      {
        permissionId: 'permission-001',
        scopeMaterial: {
          scopeMaterialId: 'smat-001',
          patientId: 'patient-001',
          scopeId: 'scope-001',
          enc_k_scope: 'encrypted-key',
          capsule: 'base64-blockchain-capsule-001',
          proxyIds: ['proxy-a'],
          status: 'ACTIVE',
        },
      },
    ]);

    const capsuleByScope = service.buildScopeCapsuleMap(scopeMaterials);
    const enrichedReferences = service.enrichReferencesWithScopeCapsules(
      [{ recordId: 'record-001', scopeId: 'scope-001' }],
      capsuleByScope
    );

    expect(scopeMaterials[0].scopeMaterial.capsule).toBe('base64-blockchain-capsule-001');
    expect(enrichedReferences).toEqual([
      {
        recordId: 'record-001',
        scopeId: 'scope-001',
        capsule: {
          format: 'umbral-capsule/base64',
          value: 'base64-blockchain-capsule-001',
        },
      },
    ]);
  });

  it('fails explicitly when an authorized scope material has no blockchain capsule', () => {
    const service = new ClinicalRecordOrchestrationService();

    expect(() => service.buildScopeCapsuleMap([
      {
        permissionId: 'permission-001',
        scopeId: 'scope-001',
        scopeMaterial: {
          scopeId: 'scope-001',
          proxyIds: ['proxy-a'],
        },
      },
    ])).toThrow(
      'Authorized scope material for scope scope-001 is missing blockchain Umbral capsule'
    );
  });
});
