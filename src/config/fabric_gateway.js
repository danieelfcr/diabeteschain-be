'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
require('dotenv').config();
const {
  connect,
  signers,
  hash,
} = require('@hyperledger/fabric-gateway');

/**
 * Fabric network configuration values resolved exclusively from environment
 * variables.
 */
const CHANNEL_NAME = process.env.FABRIC_CHANNEL;
const CHAINCODE_NAME = process.env.FABRIC_CHAINCODE;
const MSP_ID = process.env.FABRIC_MSP_ID;
const PEER_ENDPOINT = process.env.FABRIC_PEER_ENDPOINT;
const PEER_HOST_ALIAS = process.env.FABRIC_PEER_HOST_ALIAS;
const CRYPTO_BASE = process.env.FABRIC_CRYPTO_BASE;
const USER_MSP_PATH = process.env.FABRIC_USER_MSP_PATH;
const TLS_CERT_PATH = process.env.FABRIC_TLS_CERT_PATH;

/**
 * Cached singleton instances reused across the application lifecycle.
 */
let grpcClient;
let gateway;
let network;
let contract;

/**
 * Reads the first file found in the provided directory and returns its UTF-8
 * contents.
 *
 * This helper is used for MSP folders where a single certificate or private
 * key file is expected to exist.
 *
 * @param {string} dirPath - Absolute or relative path to the target directory.
 * @returns {string} The UTF-8 contents of the first file found in the directory.
 * @throws {Error} Thrown when the directory does not contain any files.
 */
function readFirstFile(dirPath) {
  const files = fs.readdirSync(dirPath);
  if (!files.length) {
    throw new Error(`No files found in directory: ${dirPath}`);
  }

  const filePath = path.join(dirPath, files[0]);
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Builds the client identity object required by the Fabric Gateway SDK.
 *
 * The identity is resolved from the sign certificate stored in the configured
 * MSP directory.
 *
 * @returns {{mspId: string, credentials: Buffer}} A Fabric client identity.
 */
function newIdentity() {
  const certPath = path.join(USER_MSP_PATH, 'signcerts');
  const credentials = readFirstFile(certPath);

  return {
    mspId: MSP_ID,
    credentials: Buffer.from(credentials),
  };
}

/**
 * Builds a transaction signer from the private key located in the keystore
 * directory.
 *
 * @returns {import('@hyperledger/fabric-gateway').Signer} A signer compatible
 * with the Fabric Gateway client.
 */
function newSigner() {
  const keyDir = path.join(USER_MSP_PATH, 'keystore');
  const privateKeyPem = readFirstFile(keyDir);

  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return signers.newPrivateKeySigner(privateKey);
}

/**
 * Creates a reusable gRPC client connection to the configured Fabric peer.
 *
 * TLS settings are derived from the peer certificate and hostname override so
 * the connection remains valid in local or containerized environments.
 *
 * @returns {grpc.Client} A configured gRPC client instance.
 */
function newGrpcConnection() {
  const tlsRootCert = fs.readFileSync(TLS_CERT_PATH);
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);

  return new grpc.Client(PEER_ENDPOINT, tlsCredentials, {
    // These overrides ensure hostname validation matches the peer TLS
    // certificate subject even when the peer is reached through localhost.
    'grpc.ssl_target_name_override': PEER_HOST_ALIAS,
    'grpc.default_authority': PEER_HOST_ALIAS,
  });
}

/**
 * Initializes the Fabric Gateway singleton and resolves the active contract.
 *
 * If the gateway has already been initialized, the cached instances are
 * returned immediately.
 *
 * @returns {Promise<{
 *   gateway: ReturnType<typeof connect>,
 *   network: import('@hyperledger/fabric-gateway').Network,
 *   contract: import('@hyperledger/fabric-gateway').Contract
 * }>} The initialized gateway, network, and contract instances.
 */
async function initFabricGateway() {
  if (gateway && network && contract) {
    return { gateway, network, contract };
  }

  grpcClient = newGrpcConnection();

  gateway = connect({
    client: grpcClient,
    identity: newIdentity(),
    signer: newSigner(),
    hash: hash.sha256,
    // Individual deadlines keep gateway operations bounded and prevent
    // requests from waiting indefinitely when the peer is unavailable.
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 5000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });

  network = gateway.getNetwork(CHANNEL_NAME);
  contract = network.getContract(CHAINCODE_NAME);

  console.log('Fabric Gateway initialized successfully');

  return { gateway, network, contract };
}

/**
 * Returns the cached contract instance, initializing the gateway if required.
 *
 * @returns {Promise<import('@hyperledger/fabric-gateway').Contract>} The active
 * chaincode contract instance.
 */
async function getContract() {
  if (!contract) {
    await initFabricGateway();
  }
  return contract;
}

/**
 * Returns the cached network instance, initializing the gateway if required.
 *
 * @returns {Promise<import('@hyperledger/fabric-gateway').Network>} The active
 * Fabric network instance.
 */
async function getNetwork() {
  if (!network) {
    await initFabricGateway();
  }
  return network;
}

/**
 * Closes the cached Fabric Gateway and gRPC client instances.
 *
 * The function attempts to close every open resource and aggregates shutdown
 * errors so the caller can handle them centrally.
 *
 * @returns {Promise<void>}
 * @throws {Error} Thrown when one or more resources fail to close.
 */
async function closeFabricGateway() {
  const errors = [];

  if (gateway) {
    try {
      gateway.close();
    } catch (err) {
      errors.push(err);
    } finally {
      gateway = null;
      network = null;
      contract = null;
    }
  }

  if (grpcClient) {
    try {
      // Closing the transport releases the underlying channel resources after
      // the gateway session has been terminated.
      grpcClient.close();
    } catch (err) {
      errors.push(err);
    } finally {
      grpcClient = null;
    }
  }

  if (errors.length) {
    throw new Error(
      `Errors while closing Fabric Gateway: ${errors.map((e) => e.message).join(' | ')}`
    );
  }
}

module.exports = {
  initFabricGateway,
  getContract,
  getNetwork,
  closeFabricGateway,
};
