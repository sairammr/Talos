// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {EvalRegistry} from "./EvalRegistry.sol";
import {AttestationRegistry} from "./AttestationRegistry.sol";

/// @title TalosEscrow — a *consumer* of onchain-attested eval verdicts.
/// @notice Holds USDC per deal. A deal names an `evalId` (from EvalRegistry). To settle,
///         the keeper posts a verdict to AttestationRegistry, then KeeperHub actuates
///         `settle(dealId, attId)`: the escrow reads the attestation, checks it targets
///         the deal's eval, and — from the *onchain* score vs the eval's *onchain*
///         threshold — releases to the seller (pass) or refunds the buyer (fail).
/// @dev    The release condition is onchain-checkable (attestation exists + evalId match
///         + score >= threshold), not a keeper's bare bool. The contract, not the keeper,
///         picks the branch. After the deadline anyone can refund() (permissionless safety
///         net). checks-effects-interactions + terminal-status guard => single settlement.
contract TalosEscrow {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Held,
        Released,
        Refunded
    }

    struct Deal {
        address buyer;
        address seller;
        uint256 amount;
        uint64 deadline;
        bytes32 evalId; // which eval must pass for this deal to release
        Status status;
    }

    IERC20 public immutable usdc;
    EvalRegistry public immutable evalRegistry;
    AttestationRegistry public immutable attestationRegistry;
    address public settler; // KeeperHub-controlled signer (onlySettler == the workflow)
    address public immutable owner;

    mapping(bytes32 => Deal) public deals;

    event Locked(
        bytes32 indexed id, address indexed buyer, address indexed seller, uint256 amount, uint64 deadline, bytes32 evalId
    );
    event Settled(bytes32 indexed id, bytes32 indexed attId, uint16 score, bool passed);
    event Released(bytes32 indexed id, address indexed seller, uint256 amount);
    event Refunded(bytes32 indexed id, address indexed buyer, uint256 amount, bool byDeadline);
    event SettlerUpdated(address indexed oldSettler, address indexed newSettler);

    error DealExists();
    error DealNotHeld();
    error BadDeadline();
    error NotSettler();
    error NotSettlerNorExpired();
    error ZeroAmount();
    error NotOwner();
    error UnknownEval();
    error EvalMismatch();

    modifier onlySettler() {
        if (msg.sender != settler) revert NotSettler();
        _;
    }

    constructor(IERC20 _usdc, address _settler, EvalRegistry _evalRegistry, AttestationRegistry _attestationRegistry) {
        usdc = _usdc;
        settler = _settler;
        evalRegistry = _evalRegistry;
        attestationRegistry = _attestationRegistry;
        owner = msg.sender;
    }

    /// @notice Rotate the settler (e.g. when the KeeperHub signer address is known).
    function setSettler(address _settler) external {
        if (msg.sender != owner) revert NotOwner();
        emit SettlerUpdated(settler, _settler);
        settler = _settler;
    }

    /// @notice Buyer locks funds for a deal, naming the eval that gates release.
    /// @dev    Buyer must `approve(escrow, amount)` first. `evalId` must exist in the
    ///         EvalRegistry. The locked USDC *is* the payment (no separate double-pay).
    function lock(bytes32 id, address seller, uint256 amount, uint64 deadline, bytes32 evalId) external {
        if (deals[id].status != Status.None) revert DealExists();
        if (deadline <= block.timestamp) revert BadDeadline();
        if (amount == 0) revert ZeroAmount();
        if (!evalRegistry.exists(evalId)) revert UnknownEval();
        deals[id] = Deal({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            deadline: deadline,
            evalId: evalId,
            status: Status.Held
        });
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Locked(id, msg.sender, seller, amount, deadline, evalId);
    }

    /// @notice Settle a deal from an onchain-attested verdict. Only the settler (the
    ///         KeeperHub workflow) may actuate, but the *outcome* is decided by the
    ///         contract: pass (score >= threshold) releases to seller, fail refunds buyer.
    function settle(bytes32 id, bytes32 attId) external onlySettler {
        Deal storage d = deals[id];
        if (d.status != Status.Held) revert DealNotHeld();

        AttestationRegistry.Attestation memory a = attestationRegistry.getAttestation(attId); // reverts if unknown
        if (a.evalId != d.evalId) revert EvalMismatch();
        uint16 threshold = evalRegistry.thresholdOf(d.evalId);

        bool passed = a.score >= threshold;
        if (passed) {
            d.status = Status.Released; // effects before interaction
            emit Settled(id, attId, a.score, true);
            emit Released(id, d.seller, d.amount);
            usdc.safeTransfer(d.seller, d.amount);
        } else {
            d.status = Status.Refunded;
            emit Settled(id, attId, a.score, false);
            emit Refunded(id, d.buyer, d.amount, false);
            usdc.safeTransfer(d.buyer, d.amount);
        }
    }

    /// @notice Return funds to the buyer after the deadline — permissionless safety net
    ///         (the autonomous Block-Interval refund workflow's write). Terminal & guarded.
    function refund(bytes32 id) external {
        Deal storage d = deals[id];
        if (d.status != Status.Held) revert DealNotHeld();
        bool expired = block.timestamp > d.deadline;
        if (msg.sender != settler && !expired) revert NotSettlerNorExpired();
        d.status = Status.Refunded; // effects before interaction
        emit Refunded(id, d.buyer, d.amount, expired);
        usdc.safeTransfer(d.buyer, d.amount);
    }

    /// @notice Read a deal (convenience for KeeperHub Web3 *read* on the refund path).
    function getDeal(bytes32 id)
        external
        view
        returns (address buyer, address seller, uint256 amount, uint64 deadline, bytes32 evalId, Status status)
    {
        Deal storage d = deals[id];
        return (d.buyer, d.seller, d.amount, d.deadline, d.evalId, d.status);
    }

    /// @notice True when a deal is Held and past its deadline — the exact predicate the
    ///         autonomous Block-Interval refund workflow branches on.
    function isExpired(bytes32 id) external view returns (bool) {
        Deal storage d = deals[id];
        return d.status == Status.Held && block.timestamp > d.deadline;
    }
}
