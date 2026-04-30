const AuditOrchestrationService = require('../../src/services/orchestration/audit.orchestration.service');

const patient = {
  username: 'patient_user',
  pseudoId: 'patient-pseudo-001',
  role: { name: 'PATIENT' },
};

const professional = {
  id: 'professional-user-001',
  username: 'doctor_user',
  firstName: 'Ana',
  middleName: 'Maria',
  firstLastName: 'Lopez',
  secondLastName: 'Diaz',
  role: { name: 'DOCTOR' },
  professional: {
    professionalId: 'COL-12345',
    organizationId: 'hospital-general',
    organization: {
      id: 'hospital-general',
      name: 'Hospital General',
    },
  },
};

function buildService({ auditEvents = [], permission = null } = {}) {
  const service = new AuditOrchestrationService();

  service.identityRepository = {
    findUserByUsername: jest.fn().mockResolvedValue(patient),
    findUserById: jest.fn(async (userId) => (userId === professional.id ? professional : null)),
  };
  service.fabricClinicalRecordRepository = {
    getAuditEventsByPatientPseudoId: jest.fn().mockResolvedValue(auditEvents),
  };
  service.fabricPermissionRepository = {
    getGrantById: jest.fn().mockResolvedValue(permission),
  };

  return service;
}

describe('AuditOrchestrationService professional enrichment', () => {
  it('enriches professional history read events from the actor identity', async () => {
    const service = buildService({
      auditEvents: [
        {
          auditId: 'audit-read-001',
          docType: 'auditEvent',
          patientPseudoId: patient.pseudoId,
          actorId: professional.id,
          actorRole: 'doctor',
          action: 'READ_CLINICAL_HISTORY',
          targetType: 'scope',
          targetId: 'scope-001',
          outcome: 'SUCCESS',
          timestamp: '2026-04-01T11:05:00.000Z',
        },
      ],
    });

    const result = await service.getMyAuditEvents({
      username: patient.username,
      role: 'PATIENT',
    });

    expect(service.identityRepository.findUserById).toHaveBeenCalledWith(professional.id);
    expect(service.fabricPermissionRepository.getGrantById).not.toHaveBeenCalled();
    expect(result.data[0].professional).toEqual({
      id: professional.id,
      professionalId: 'COL-12345',
      username: 'doctor_user',
      fullName: 'Ana Maria Lopez Diaz',
      role: 'DOCTOR',
      organization: {
        id: 'hospital-general',
        name: 'Hospital General',
      },
    });
  });

  it('enriches grant and revoke audit events from the permission grantee', async () => {
    const service = buildService({
      auditEvents: [
        {
          auditId: 'audit-grant-001',
          docType: 'auditEvent',
          patientPseudoId: patient.pseudoId,
          actorId: patient.pseudoId,
          actorRole: 'patient',
          action: 'GRANT_PERMISSION',
          targetType: 'permission',
          targetId: 'permission-001',
          outcome: 'SUCCESS',
          timestamp: '2026-04-01T11:05:00.000Z',
        },
      ],
      permission: {
        permissionId: 'permission-001',
        granteeId: professional.id,
      },
    });

    const result = await service.getMyAuditEvents({
      username: patient.username,
      role: 'PATIENT',
    });

    expect(service.fabricPermissionRepository.getGrantById).toHaveBeenCalledWith('permission-001');
    expect(service.identityRepository.findUserById).toHaveBeenCalledWith(professional.id);
    expect(result.data[0]).toMatchObject({
      action: 'GRANT_PERMISSION',
      professional: {
        fullName: 'Ana Maria Lopez Diaz',
        role: 'DOCTOR',
        organization: {
          name: 'Hospital General',
        },
      },
    });
  });
});
