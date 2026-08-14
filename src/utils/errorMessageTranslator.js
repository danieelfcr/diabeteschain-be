const exactTranslations = {
  'Authentication token is required': 'Se requiere un token de autenticación.',
  'Invalid authentication token': 'El token de autenticación no es válido.',
  'Authentication token expired': 'El token de autenticación ha expirado.',
  'Authentication required': 'Se requiere autenticación.',
  'Authentication role is required': 'La autenticación no incluye un rol de usuario.',
  'Forbidden for current role': 'No tienes permisos para realizar esta acción con tu rol actual.',
  'Invalid credentials': 'Las credenciales son inválidas.',
  'User is inactive or blocked': 'El usuario está inactivo o bloqueado.',
  'User not found': 'Usuario no encontrado.',
  'Public key not found for this user': 'No se encontró una llave pública para este usuario.',
  'Email already exists': 'Ya existe una cuenta registrada con este correo electrónico.',
  'professionalId is required for non-PATIENT roles': 'El ID profesional es obligatorio para los roles que no son pacientes.',
  'organizationId is required for non-PATIENT roles': 'La organización es obligatoria para los roles que no son pacientes.',
  'Invalid role. Allowed roles: PATIENT, DOCTOR, PHARMACIST, LABORATORY': 'El rol indicado no es válido.',
  'Organization not found': 'Organización no encontrada.',
  'Role not found': 'Rol no encontrado.',
  'Status ACTIVE not found': 'No se encontró el estado activo requerido.',
  'At least one clinical scope is required': 'Se requiere al menos un alcance clínico.',
  'Write access must include read access': 'El acceso de escritura debe incluir acceso de lectura.',
  'Scope identifier is required': 'Se requiere el identificador del alcance clínico.',
  'Scope not found': 'Alcance clínico no encontrado.',
  'Patient not found in identity repository': 'Paciente no encontrado.',
  'Authenticated patient not found in identity repository': 'No se encontró el paciente autenticado.',
  'Authenticated professional not found in identity repository': 'No se encontró el profesional autenticado.',
  'Target user must have PATIENT role': 'El usuario indicado debe tener el rol de paciente.',
  'Authenticated user must have PATIENT role': 'El usuario autenticado debe tener el rol de paciente.',
  'Authenticated user must have a valid healthcare professional role': 'El usuario autenticado debe tener un rol profesional de salud válido.',
  'Only healthcare professionals can retrieve delegated history': 'Solo los profesionales de salud pueden consultar historiales delegados.',
  'No active access grant found for this patient and professional': 'No existe un permiso de acceso activo para este paciente y profesional.',
  'The active permissions do not allow delegated read access': 'Los permisos activos no permiten consultar el historial delegado.',
  'The active permission does not grant any readable scopes': 'El permiso activo no otorga alcances clínicos de lectura.',
  'The active permissions do not reference any active clinical scope': 'Los permisos activos no incluyen ningún alcance clínico activo.',
  'The active permissions do not grant readable record types for this role': 'Los permisos activos no otorgan tipos de registros legibles para este rol.',
  'No active write access grant found for this patient and professional': 'No existe un permiso activo de escritura para este paciente y profesional.',
  'The active permission does not allow write access': 'El permiso activo no permite acceso de escritura.',
  'Clinical record payload is required': 'Se requiere el contenido del registro clínico.',
  'Authenticated actor public key is required': 'Se requiere la llave pública del usuario autenticado.',
  'Invalid signature for permission grant': 'La firma para otorgar el permiso no es válida.',
  'Invalid signature for access revocation': 'La firma para revocar el acceso no es válida.',
  'Permission does not belong to the authenticated patient and grantee': 'El permiso no pertenece al paciente autenticado ni al profesional indicado.',
  'No active PRE proxy nodes are available': 'No hay nodos proxy PRE activos disponibles.',
};

/**
 * Converts internal API errors into Spanish messages suitable for end users.
 * Technical errors that are not explicitly mapped are replaced with a
 * status-based message so implementation details are never exposed.
 *
 * @param {string} message - Internal error message.
 * @param {number} statusCode - HTTP status associated with the error.
 * @returns {string} Spanish error message safe to return to API consumers.
 */
function translateErrorMessage(message, statusCode) {
  if (exactTranslations[message]) {
    return exactTranslations[message];
  }

  const patterns = [
    [/^Missing required field: (.+)$/, 'Falta el campo requerido: $1.'],
    [/^Field (.+) must be a string$/, 'El campo $1 debe ser una cadena de texto.'],
    [/^Field (.+) must be an object$/, 'El campo $1 debe ser un objeto.'],
    [/^Field (.+) cannot be empty$/, 'El campo $1 no puede estar vacío.'],
    [/^Field (.+) must be a non-empty array$/, 'El campo $1 debe ser una lista no vacía.'],
    [/^Field (.+) must be at least (\d+) characters$/, 'El campo $1 debe tener al menos $2 caracteres.'],
    [/^Field (.+) must be at most (\d+) characters$/, 'El campo $1 debe tener como máximo $2 caracteres.'],
    [/^Field (.+) must use YYYY-MM-DD date format$/, 'El campo $1 debe usar el formato de fecha AAAA-MM-DD.'],
    [/^Field (.+) must be a valid date$/, 'El campo $1 debe contener una fecha válida.'],
    [/^Field (.+) must be an ISO 8601 string$/, 'El campo $1 debe usar una fecha ISO 8601.'],
    [/^Field (.+) is not a valid ISO 8601 datetime$/, 'El campo $1 debe contener una fecha y hora ISO 8601 válida.'],
    [/^Invalid actions: .+$/, 'Se incluyeron acciones no válidas.'],
    [/^Invalid scopes: (.+)$/, 'Alcances clínicos no válidos: $1.'],
    [/^Authenticated patient username is required$/, 'Se requiere el nombre de usuario del paciente autenticado.'],
    [/^Authenticated professional username is required$/, 'Se requiere el nombre de usuario del profesional autenticado.'],
    [/^Authenticated patient pseudoId is required$/, 'Se requiere el identificador seudónimo del paciente autenticado.'],
    [/^Authenticated professional pseudoId is required$/, 'Se requiere el identificador seudónimo del profesional autenticado.'],
    [/^Target patient pseudoId is required$/, 'Se requiere el identificador seudónimo del paciente indicado.'],
    [/^No active ScopeMaterial found for scope (.+)$/, 'No existe material de alcance activo para el alcance $1.'],
    [/^No active permission found for scope (.+)$/, 'No existe un permiso activo para el alcance $1.'],
    [/^ScopeMaterial for scope (.+) is missing PRE proxy identifiers$/, 'El material del alcance $1 no tiene identificadores de nodos proxy PRE.'],
    [/^ScopeMaterial for scope (.+) is missing encryptedScopeKeyEncoding$/, 'El material del alcance $1 no incluye la codificación de la llave cifrada.'],
  ];

  for (const [pattern, translation] of patterns) {
    if (pattern.test(message)) {
      return message.replace(pattern, translation);
    }
  }

  if (statusCode === 400) return 'La solicitud contiene datos inválidos.';
  if (statusCode === 401) return 'No fue posible autenticar la solicitud.';
  if (statusCode === 403) return 'No tienes permisos para realizar esta acción.';
  if (statusCode === 404) return 'No se encontró el recurso solicitado.';
  if (statusCode === 409) return 'No se pudo completar la solicitud debido a un conflicto de datos.';
  if (statusCode >= 500) return 'Ocurrió un error interno. Intenta nuevamente más tarde.';

  return 'Ocurrió un error inesperado.';
}

module.exports = {
  translateErrorMessage,
};
