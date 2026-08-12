// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EvalRegistry — the onchain catalogue of reproducible evals.
/// @notice An eval names an off-chain evaluator by the hash of its implementation
///         (`evaluatorCodeHash`) and pins the pass bar (`threshold`, basis points).
///         A verdict later cites `evalId`; anyone resolves the code hash, re-runs the
///         evaluator on the same input, and must reproduce the score. Reproducibility
///         is therefore an onchain-anchored property, not a claim.
/// @dev    v1 registers only the `Reproducible` trust tier; `Attested`/`Judged` are
///         reserved in the enum and rejected at registration until those tiers ship.
contract EvalRegistry {
    enum TrustTier {
        Reproducible,
        Attested,
        Judged
    }

    struct Eval {
        bytes32 id; // keccak256(name, version)
        string name;
        uint16 version;
        bytes32 evaluatorCodeHash; // hash of the evaluator implementation (reproducibility anchor)
        TrustTier trustTier;
        uint16 threshold; // basis points (0..10000) a score must reach to pass
        bytes32 schemaHash; // hash of the input/delivery schema
        address author;
        bool exists;
    }

    mapping(bytes32 => Eval) internal evals;

    event EvalRegistered(
        bytes32 indexed id, string name, uint16 version, bytes32 evaluatorCodeHash, uint16 threshold, address indexed author
    );

    error EvalExists();
    error BadThreshold();
    error UnsupportedTier();
    error UnknownEval();

    /// @notice Register an eval. `id = keccak256(abi.encode(name, version))`, immutable
    ///         once set — a new version is a new entry with a new id.
    function register(
        string calldata name,
        uint16 version,
        bytes32 evaluatorCodeHash,
        TrustTier trustTier,
        uint16 threshold,
        bytes32 schemaHash
    ) external returns (bytes32 id) {
        if (trustTier != TrustTier.Reproducible) revert UnsupportedTier(); // v1: Reproducible only
        if (threshold > 10_000) revert BadThreshold();
        id = keccak256(abi.encode(name, version));
        if (evals[id].exists) revert EvalExists();
        evals[id] = Eval({
            id: id,
            name: name,
            version: version,
            evaluatorCodeHash: evaluatorCodeHash,
            trustTier: trustTier,
            threshold: threshold,
            schemaHash: schemaHash,
            author: msg.sender,
            exists: true
        });
        emit EvalRegistered(id, name, version, evaluatorCodeHash, threshold, msg.sender);
    }

    function getEval(bytes32 id) external view returns (Eval memory) {
        if (!evals[id].exists) revert UnknownEval();
        return evals[id];
    }

    function exists(bytes32 id) external view returns (bool) {
        return evals[id].exists;
    }

    /// @notice Pass bar for an eval (basis points). Reverts if the eval is unknown.
    function thresholdOf(bytes32 id) external view returns (uint16) {
        if (!evals[id].exists) revert UnknownEval();
        return evals[id].threshold;
    }
}
