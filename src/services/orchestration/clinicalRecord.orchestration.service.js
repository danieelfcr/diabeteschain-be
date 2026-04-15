const ClinicalRecordRepository = require('../../repositories/clinicalRecord.repository');
const FabricClinicalRecordRepository = require('../../repositories/fabricClinicalRecord.repository');
const IdentityRepository = require('../../repositories/identity.repository');
const ProxyReencryptionClient = require('../../clients/proxyReencryption/proxyReencryption.client');
const { mapClinicalRecord } = require('../../mappers/clinicalRecord.mapper');
const { createAppError } = require('../../utils/app-error');

/**
 * Service responsible for coordinating clinical record use cases.
 *
 * The current implementation intentionally returns structured placeholders so
 * the architecture can be integrated before the final Fabric, Mongo, and
 * proxy re-encryption workflows are implemented.
 */
class ClinicalRecordOrchestrationService {
  /**
   * Build the orchestration service with all repository and client
   * dependencies required by the future implementation.
   */
  constructor() {
    this.clinicalRecordRepository = ClinicalRecordRepository;
    this.fabricClinicalRecordRepository = new FabricClinicalRecordRepository();
    this.identityRepository = new IdentityRepository();
    this.proxyReencryptionClient = new ProxyReencryptionClient();
  }

  /**
   * Resolve a normalized role name from plain objects or persistence models.
   *
   * @param {Object|string|null|undefined} source - User or role source.
   * @returns {string|null} Normalized role name.
   */
  getRoleName(source) {
    if (!source) {
      return null;
    }

    if (typeof source === 'string') {
      return source;
    }

    return source?.role?.name || source?.role || source?.name || null;
  }

  /**
   * Coordinate retrieval of the authenticated patient's history.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async getPatientHistory(payload, actor) {
    // 1. Validations
    // 1.1 Validate that the actor is authenticated and has the PATIENT role
    if (!actor) {
      throw createAppError('Authentication required to retrieve patient history', 401);
    }
    if (this.getRoleName(actor) !== 'PATIENT') {
      throw createAppError('Only users with PATIENT role can retrieve their own history', 403);
    }

    // 1.2 Resolve the patient pseudoId only from the authenticated actor
    const patientPseudoId = actor.pseudoId || null;
    if (!patientPseudoId) {
      throw createAppError('Authenticated patient pseudoId is required', 400);
    }

    // 1.3 Resolve the patient identity from a trusted source
    const patient = await this.identityRepository.findUserByPseudoId(patientPseudoId);
    if (!patient) {
      throw createAppError('Authenticated patient not found in identity repository', 404);
    }

    // 2. Retrieve clinical references/indexes from the ledger for the patient
    const references = await this.fabricClinicalRecordRepository.getPatientRecordIndexes(patientPseudoId);

    // 3. Retrieve encrypted off-chain clinical records for the patient
    const records = references.length
      ? await this.clinicalRecordRepository.getClinicalRecordsByReferences(references, patientPseudoId)
      : await this.clinicalRecordRepository.getPatientClinicalDocuments(patientPseudoId);

    const referenceMap = new Map(
      references
        .map((reference) => [reference.recordId, reference])
        .filter(([recordId]) => Boolean(recordId))
    );

    return {
      message: 'Patient history retrieved successfully',
      status: 'success',
      action: 'get_patient_history',
      patient: {
        id: patient.id || null,
        pseudoId: patient.pseudoId || patientPseudoId,
        username: patient.username || null,
      },
      totalRecords: records.length,
      records: records.map((record) => mapClinicalRecord(record, referenceMap.get(record.recordId) || null)),
    };
  }

  /**
   * Coordinate retrieval of a patient's history by an authorized
   * healthcare professional.
   *
   * @param {Object} filters - Normalized query filters.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async getProfessionalHistory(filters, actor) {
    return {
      message: 'Professional history orchestration pending implementation',
      status: 'pending_implementation',
      action: 'get_professional_history',
      actor: this.mapActor(actor),
      filters,
      integrationPoints: [
        'FabricClinicalRecordRepository.getHistoryByPatientPseudoId',
        'ClinicalRecordRepository.findAll',
        'ProxyReencryptionClient.resolveHistoryAccess',
      ],
    };
  }

  /**
   * Coordinate doctor clinical event registration.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async registerDoctorEvent(payload, actor) {
    return {
      message: 'Doctor event orchestration pending implementation',
      status: 'pending_implementation',
      action: 'register_doctor_event',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'FabricClinicalRecordRepository.appendDoctorEvent',
        'ClinicalRecordRepository.create',
      ],
    };
  }

  /**
   * Coordinate laboratory event registration.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async registerLaboratoryEvent(payload, actor) {
    return {
      message: 'Laboratory event orchestration pending implementation',
      status: 'pending_implementation',
      action: 'register_laboratory_event',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'FabricClinicalRecordRepository.appendLaboratoryEvent',
        'ClinicalRecordRepository.create',
      ],
    };
  }

  /**
   * Coordinate pharmacy dispatch registration.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async registerPharmacyDispatch(payload, actor) {
    return {
      message: 'Pharmacy dispatch orchestration pending implementation',
      status: 'pending_implementation',
      action: 'register_pharmacy_dispatch',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'FabricClinicalRecordRepository.appendPharmacyDispatch',
        'ClinicalRecordRepository.create',
      ],
    };
  }

  /**
   * Normalize the authenticated user context for orchestration responses.
   *
   * @param {Object|null|undefined} actor - Authenticated user context.
   * @returns {Object|null} Sanitized actor representation.
   */
  mapActor(actor) {
    if (!actor) {
      return null;
    }

    return {
      id: actor.id || null,
      pseudoId: actor.pseudoId || null,
      role: actor.role?.name || actor.role || null,
    };
  }
}

module.exports = ClinicalRecordOrchestrationService;
