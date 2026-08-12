// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

/// @title TalosEscrow — conditional settlement custody for agent-to-agent work.
/// @notice Holds USDC per deal. The keeper/verifier decides; KeeperHub actuates
///         release() / refund() via a workflow Web3 Action signed by `settler`.
///         Custody is never hostage to the keeper: after the deadline anyone can
///         trigger refund() so funds are never stuck (permissionless safety net).
/// @dev    checks-effects-interactions + terminal-status guard => single settlement,
///         no reentrancy payout. SafeERC20 handles non-standard ERC20s.
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
        Status status;
    }

    IERC20 public immutable usdc;
    address public settler; // KeeperHub-controlled signer (onlySettler == the workflow)
    address public immutable owner;

    mapping(bytes32 => Deal) public deals;

    event Locked(
        bytes32 indexed id, address indexed buyer, address indexed seller, uint256 amount, uint64 deadline
    );
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

    modifier onlySettler() {
        if (msg.sender != settler) revert NotSettler();
        _;
    }

    constructor(IERC20 _usdc, address _settler) {
        usdc = _usdc;
        settler = _settler;
        owner = msg.sender;
    }

    /// @notice Rotate the settler (e.g. when the KeeperHub signer address is known).
    function setSettler(address _settler) external {
        if (msg.sender != owner) revert NotOwner();
        emit SettlerUpdated(settler, _settler);
        settler = _settler;
    }

    /// @notice Buyer locks funds for a deal. Pulls `amount` USDC from msg.sender.
    /// @dev    Buyer must `approve(escrow, amount)` first. The locked USDC *is* the
    ///         payment — no separate double-pay (PRD §6a).
    function lock(bytes32 id, address seller, uint256 amount, uint64 deadline) external {
        if (deals[id].status != Status.None) revert DealExists();
        if (deadline <= block.timestamp) revert BadDeadline();
        if (amount == 0) revert ZeroAmount();
        deals[id] = Deal({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            deadline: deadline,
            status: Status.Held
        });
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Locked(id, msg.sender, seller, amount, deadline);
    }

    /// @notice Pay the seller. Only the settler (KeeperHub workflow) may release,
    ///         and only for a proven-delivery verdict carried in by the keeper.
    function release(bytes32 id) external onlySettler {
        Deal storage d = deals[id];
        if (d.status != Status.Held) revert DealNotHeld();
        d.status = Status.Released; // effects before interaction
        emit Released(id, d.seller, d.amount);
        usdc.safeTransfer(d.seller, d.amount);
    }

    /// @notice Return funds to the buyer. Two paths, both terminal & guarded:
    ///         - settler refunds on critic rejection (any time)
    ///         - ANYONE refunds after the deadline (permissionless safety net)
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
        returns (address buyer, address seller, uint256 amount, uint64 deadline, Status status)
    {
        Deal storage d = deals[id];
        return (d.buyer, d.seller, d.amount, d.deadline, d.status);
    }

    /// @notice True when a deal is Held and past its deadline — the exact predicate
    ///         the autonomous Block-Interval refund workflow branches on (PRD §3a).
    function isExpired(bytes32 id) external view returns (bool) {
        Deal storage d = deals[id];
        return d.status == Status.Held && block.timestamp > d.deadline;
    }
}
