// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EvalRegistry} from "./EvalRegistry.sol";

/// @title AttestationRegistry — onchain record of graded verdicts.
/// @notice An evaluator posts `attest(evalId, …, score, evidenceHash)`; the record is
///         the onchain-attested verdict any consumer (escrow, reputation reader,
///         marketplace) acts on. `score` is basis points 0..10000. Reputation is read
///         off `Attested` events — no extra onchain state.
/// @dev    `attest` is permissionless and records `msg.sender` as the evaluator; a
///         consumer trusts an attestation only for its own named `evalId` and applies
///         the onchain threshold from EvalRegistry. Evaluator-identity trust
///         (allowlist/stake) is a future tier, out of v1 scope.
contract AttestationRegistry {
    struct Attestation {
        bytes32 evalId;
        uint16 version;
        bytes32 deliverableHash; // hash of the delivery evaluated
        bytes32 inputHash; // hash of the input/spec (pins WHAT was evaluated)
        uint16 score; // basis points 0..10000
        bytes32 evidenceHash; // hash of the independently-checkable evidence
        address evaluator;
        uint64 timestamp;
        bool exists;
    }

    EvalRegistry public immutable evalRegistry;

    mapping(bytes32 => Attestation) internal attestations;
    uint256 public count; // monotonic, for attId uniqueness

    event Attested(
        bytes32 indexed attId, address indexed evaluator, bytes32 indexed evalId, bytes32 deliverableHash, uint16 score
    );

    error UnknownEval();
    error BadScore();
    error UnknownAttestation();

    constructor(EvalRegistry _evalRegistry) {
        evalRegistry = _evalRegistry;
    }

    /// @notice Post a verdict. Reverts unless `evalId` exists and `score <= 10000`.
    function attest(
        bytes32 evalId,
        uint16 version,
        bytes32 deliverableHash,
        bytes32 inputHash,
        uint16 score,
        bytes32 evidenceHash
    ) external returns (bytes32 attId) {
        if (!evalRegistry.exists(evalId)) revert UnknownEval();
        if (score > 10_000) revert BadScore();
        attId = keccak256(abi.encode(evalId, deliverableHash, inputHash, msg.sender, count));
        count += 1;
        attestations[attId] = Attestation({
            evalId: evalId,
            version: version,
            deliverableHash: deliverableHash,
            inputHash: inputHash,
            score: score,
            evidenceHash: evidenceHash,
            evaluator: msg.sender,
            timestamp: uint64(block.timestamp),
            exists: true
        });
        emit Attested(attId, msg.sender, evalId, deliverableHash, score);
    }

    function getAttestation(bytes32 attId) external view returns (Attestation memory) {
        if (!attestations[attId].exists) revert UnknownAttestation();
        return attestations[attId];
    }

    function attestationExists(bytes32 attId) external view returns (bool) {
        return attestations[attId].exists;
    }
}
