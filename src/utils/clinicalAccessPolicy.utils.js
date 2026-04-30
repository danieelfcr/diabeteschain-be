const RECORD_TYPES = Object.freeze([
  'ENCOUNTER',
  'LAB_ORDER',
  'LAB_RESULT',
  'MEDICAL_PRESCRIPTION',
  'PHARMACY_DISPATCH',
]);

const ROLE_RECORD_TYPE_ACCESS = Object.freeze({
  DOCTOR: Object.freeze({
    read: RECORD_TYPES,
    write: Object.freeze(['ENCOUNTER', 'LAB_ORDER', 'MEDICAL_PRESCRIPTION']),
  }),
  LABORATORY: Object.freeze({
    read: Object.freeze(['LAB_ORDER']),
    write: Object.freeze(['LAB_RESULT']),
  }),
  PHARMACIST: Object.freeze({
    read: Object.freeze(['MEDICAL_PRESCRIPTION', 'PHARMACY_DISPATCH']),
    write: Object.freeze(['PHARMACY_DISPATCH']),
  }),
});

const RECORD_TYPE_ALIASES = Object.freeze({
  LABORATORY_RESULT: 'LAB_RESULT',
  PRESCRIPTION: 'MEDICAL_PRESCRIPTION',
  DISPENSATION: 'PHARMACY_DISPATCH',
});

function normalizeArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function normalizeClinicalRole(role) {
  return typeof role === 'string' ? role.trim().toUpperCase() || null : null;
}

function normalizeClinicalAction(action) {
  return typeof action === 'string' ? action.trim().toLowerCase() || null : null;
}

function normalizeAccessRecordType(recordType) {
  if (!recordType) {
    return null;
  }

  const normalized = String(recordType).trim().replace(/[\s-]+/g, '_').toUpperCase();
  return RECORD_TYPE_ALIASES[normalized] || normalized;
}

function normalizeRecordTypeList(recordTypes = []) {
  const knownTypes = new Set(RECORD_TYPES);
  return [...new Set(
    normalizeArray(recordTypes)
      .map((recordType) => normalizeAccessRecordType(recordType))
      .filter((recordType) => recordType && knownTypes.has(recordType))
  )];
}

function getAllowedRecordTypesForRoleAction(role, action) {
  const normalizedRole = normalizeClinicalRole(role);
  const normalizedAction = normalizeClinicalAction(action);

  return [
    ...(ROLE_RECORD_TYPE_ACCESS[normalizedRole]?.[normalizedAction] || []),
  ];
}

function getAllowedRecordTypesForRoleActions(role, actions = []) {
  const normalizedActions = normalizeArray(actions).map((action) => normalizeClinicalAction(action));

  return {
    allowedReadRecordTypes: normalizedActions.includes('read')
      ? getAllowedRecordTypesForRoleAction(role, 'read')
      : [],
    allowedWriteRecordTypes: normalizedActions.includes('write')
      ? getAllowedRecordTypesForRoleAction(role, 'write')
      : [],
  };
}

function intersectRecordTypes(left = [], right = []) {
  const rightSet = new Set(normalizeRecordTypeList(right));
  return normalizeRecordTypeList(left).filter((recordType) => rightSet.has(recordType));
}

function getPermissionRecordTypesForAction(permission, role, action) {
  const fieldName = normalizeClinicalAction(action) === 'write'
    ? 'allowedWriteRecordTypes'
    : 'allowedReadRecordTypes';
  const roleRecordTypes = getAllowedRecordTypesForRoleAction(role, action);
  const permissionRecordTypes = normalizeRecordTypeList(permission?.[fieldName]);

  if (permissionRecordTypes.length === 0) {
    return roleRecordTypes;
  }

  return intersectRecordTypes(permissionRecordTypes, roleRecordTypes);
}

function getEffectiveRecordTypesForAction(permissions = [], role, action) {
  const roleRecordTypes = getAllowedRecordTypesForRoleAction(role, action);
  if (roleRecordTypes.length === 0) {
    return [];
  }

  return [...new Set(
    normalizeArray(permissions).flatMap((permission) =>
      getPermissionRecordTypesForAction(permission, role, action)
    )
  )];
}

function isRecordTypeAllowedForRoleAction(role, action, recordType) {
  const normalizedRecordType = normalizeAccessRecordType(recordType);
  return Boolean(
    normalizedRecordType
      && getAllowedRecordTypesForRoleAction(role, action).includes(normalizedRecordType)
  );
}

module.exports = {
  RECORD_TYPES,
  ROLE_RECORD_TYPE_ACCESS,
  normalizeAccessRecordType,
  normalizeRecordTypeList,
  getAllowedRecordTypesForRoleAction,
  getAllowedRecordTypesForRoleActions,
  getEffectiveRecordTypesForAction,
  isRecordTypeAllowedForRoleAction,
};
