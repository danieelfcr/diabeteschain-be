const {
  buildDoctorConsultationSignaturePayload,
  buildGrantAccessSignaturePayload,
  normalizePermissionSignatureCollections,
  normalizePermissionValidityPeriod,
} = require('../../src/utils/signaturePayload.utils');

describe('signaturePayload.utils', () => {
  it('normalizes permission dates and sorts permission arrays before signing', () => {
    const validityPeriod = normalizePermissionValidityPeriod({
      validFrom: '2026-04-15T18:30:00-06:00',
      validTo: '2026-04-16T18:30:00-06:00',
    });

    const collections = normalizePermissionSignatureCollections({
      allowedActions: ['write', 'read', 'read'],
      allowedScopes: ['summary', 'labs', 'summary'],
    });

    expect(validityPeriod).toEqual({
      validFrom: '2026-04-16T00:30:00.000Z',
      validTo: '2026-04-17T00:30:00.000Z',
    });

    expect(collections).toEqual({
      allowedActions: ['read', 'write'],
      allowedScopes: ['labs', 'summary'],
    });

    expect(
      buildGrantAccessSignaturePayload({
        patientPseudoId: 'patient-001',
        granteeId: 'doctor-001',
        ...collections,
        ...validityPeriod,
      })
    ).toEqual({
      action: 'GRANT_ACCESS',
      patientPseudoId: 'patient-001',
      granteeId: 'doctor-001',
      allowedActions: ['read', 'write'],
      allowedScopes: ['labs', 'summary'],
      validFrom: '2026-04-16T00:30:00.000Z',
      validTo: '2026-04-17T00:30:00.000Z',
    });
  });

  it('rejects ambiguous permission dates that are not ISO 8601 with timezone', () => {
    expect(() =>
      normalizePermissionValidityPeriod({
        validFrom: '04/15/2026 18:30',
        validTo: '2026-04-16T18:30:00Z',
      })
    ).toThrow('Field validFrom must use ISO 8601 datetime format with timezone');
  });

  it('builds the explicit doctor consultation signature contract only with signed fields', () => {
    const signaturePayload = buildDoctorConsultationSignaturePayload({
      patientPseudoId: 'patient-001',
      encounter: {
        scopeId: 'encounters',
        payloadMetadata: {
          fhirResourceType: 'Encounter',
          payloadFormat: 'FHIR_JSON',
          contentType: 'application/json',
        },
        encryption: {
          algorithm: 'AES-256-GCM',
          iv: 'iv-value',
          authTag: 'tag-value',
          ciphertext: 'cipher-value',
        },
        integrity: {
          payloadHash: 'hash-encounter',
        },
        ignoredField: 'not-signed',
      },
      labOrder: null,
      prescription: null,
    });

    expect(signaturePayload).toEqual({
      action: 'REGISTER_DOCTOR_CONSULTATION',
      patientPseudoId: 'patient-001',
      encounter: {
        recordType: 'ENCOUNTER',
        scopeId: 'encounters',
        payloadMetadata: {
          fhirResourceType: 'Encounter',
          payloadFormat: 'FHIR_JSON',
          contentType: 'application/json',
        },
        encryption: {
          algorithm: 'AES-256-GCM',
          iv: 'iv-value',
          authTag: 'tag-value',
          ciphertext: 'cipher-value',
        },
        integrity: {
          payloadHash: 'hash-encounter',
        },
      },
      labOrder: null,
      prescription: null,
    });
  });
});
