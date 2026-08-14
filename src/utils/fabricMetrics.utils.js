const fs = require('fs/promises');
const path = require('path');
const { performance } = require('perf_hooks');
const { getLoadTestContext } = require('./loadTestContext');

const CSV_COLUMNS = [
  'timestamp',
  'scenario',
  'operation',
  'txId',
  'recordId',
  'patientId',
  'actorId',
  'totalBackendLatencyMs',
  'fabricConfirmationMs',
  'status',
  'errorMessage',
];

let initializedPath = null;
let initializationPromise = null;
let warnedAboutMetrics = false;

function resolveMetricsPath() {
  if (process.env.FABRIC_METRICS_PATH) {
    return path.resolve(process.env.FABRIC_METRICS_PATH);
  }

  return path.resolve(__dirname, '..', '..', 'load-tests', 'results', 'fabric_metrics.csv');
}

function csvEscape(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

async function ensureMetricsFile(filePath) {
  if (initializedPath === filePath && initializationPromise) {
    return initializationPromise;
  }

  initializedPath = filePath;
  initializationPromise = (async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let shouldWriteHeader = false;
    try {
      const stat = await fs.stat(filePath);
      shouldWriteHeader = stat.size === 0;
    } catch (error) {
      shouldWriteHeader = true;
    }

    if (shouldWriteHeader) {
      await fs.appendFile(filePath, `${CSV_COLUMNS.join(',')}\n`, 'utf8');
    }
  })();

  return initializationPromise;
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || null;
}

function inferMetricFields({ payload = {}, result = {} }) {
  const resultData = result && typeof result === 'object'
    ? result.data || result.record || result.index || result.scopeMaterial || result
    : {};

  return {
    txId: pickFirst(result?.txId, result?.transactionId, resultData?.txId, resultData?.transactionId, payload.txId),
    recordId: pickFirst(
      payload.recordId,
      payload.clinicalRecordId,
      resultData?.recordId,
      resultData?.clinicalRecordId,
      resultData?._id
    ),
    patientId: pickFirst(
      payload.patientPseudoId,
      payload.patientId,
      resultData?.patientPseudoId,
      resultData?.patientId
    ),
    actorId: pickFirst(
      payload.createdBy,
      payload.professionalId,
      payload.granteeId,
      resultData?.createdBy,
      resultData?.professionalId,
      resultData?.granteeId
    ),
  };
}

function buildMetricRow(metric) {
  const context = getLoadTestContext();
  const inferred = inferMetricFields(metric);
  const totalBackendLatencyMs = metric.totalBackendLatencyMs !== undefined
    ? metric.totalBackendLatencyMs
    : context?.requestStartMs
      ? performance.now() - context.requestStartMs
      : null;

  return {
    timestamp: new Date().toISOString(),
    scenario: metric.scenario || context?.scenario || 'manual',
    operation: metric.operation || metric.functionName || null,
    txId: metric.txId || inferred.txId,
    recordId: metric.recordId || inferred.recordId,
    patientId: metric.patientId || inferred.patientId,
    actorId: metric.actorId || inferred.actorId,
    totalBackendLatencyMs: Number.isFinite(totalBackendLatencyMs)
      ? totalBackendLatencyMs.toFixed(3)
      : '',
    fabricConfirmationMs: Number.isFinite(metric.fabricConfirmationMs)
      ? metric.fabricConfirmationMs.toFixed(3)
      : '',
    status: metric.status || null,
    errorMessage: metric.errorMessage || null,
  };
}

async function recordFabricMetric(metric = {}) {
  if (process.env.FABRIC_METRICS_ENABLED === 'false') {
    return;
  }

  try {
    const filePath = resolveMetricsPath();
    const row = buildMetricRow(metric);
    const line = CSV_COLUMNS.map((column) => csvEscape(row[column])).join(',');

    await ensureMetricsFile(filePath);

    await fs.appendFile(filePath, `${line}\n`, 'utf8');
  } catch (error) {
    if (!warnedAboutMetrics) {
      warnedAboutMetrics = true;
      console.warn('[FABRIC_METRICS] Unable to write Fabric metric:', error.message);
    }
  }
}

module.exports = {
  recordFabricMetric,
  resolveMetricsPath,
};
