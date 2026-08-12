// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TalosEscrow} from "../src/TalosEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {EvalRegistry} from "../src/EvalRegistry.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

contract TalosEscrowTest is Test {
    TalosEscrow escrow;
    MockUSDC usdc;
    EvalRegistry evalReg;
    AttestationRegistry attReg;

    address settler = address(0x5E77);
    address buyer = address(0xB0B);
    address seller = address(0x5E11);
    address stranger = address(0xDEAD);
    address evaluator = address(0xE7A1);

    uint256 constant AMOUNT = 10_000_000; // 10 USDC (6 decimals)
    bytes32 constant DEAL = keccak256("deal-1");

    bytes32 evalRepro; // threshold 10000 (binary)
    bytes32 evalField; // threshold 9500 (graded)

    function setUp() public {
        usdc = new MockUSDC();
        evalReg = new EvalRegistry();
        attReg = new AttestationRegistry(evalReg);
        escrow = new TalosEscrow(IERC20(address(usdc)), settler, evalReg, attReg);

        evalRepro =
            evalReg.register("reproduction", 1, keccak256("repro-code"), EvalRegistry.TrustTier.Reproducible, 10_000, bytes32(0));
        evalField =
            evalReg.register("fieldMatch", 1, keccak256("field-code"), EvalRegistry.TrustTier.Reproducible, 9500, bytes32(0));

        usdc.mint(buyer, 1_000_000_000);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _lock(bytes32 evalId) internal {
        vm.prank(buyer);
        escrow.lock(DEAL, seller, AMOUNT, uint64(block.timestamp + 10 minutes), evalId);
    }

    function _attest(bytes32 evalId, uint16 score) internal returns (bytes32 attId) {
        vm.prank(evaluator);
        attId = attReg.attest(evalId, 1, keccak256("delivery"), keccak256("input"), score, keccak256("evidence"));
    }

    // --- lock ---

    function test_Lock_HoldsFunds() public {
        _lock(evalRepro);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        (,,,, bytes32 evalId, TalosEscrow.Status status) = escrow.getDeal(DEAL);
        assertEq(uint256(status), uint256(TalosEscrow.Status.Held));
        assertEq(evalId, evalRepro);
    }

    function test_Lock_RevertsOnDuplicate() public {
        _lock(evalRepro);
        vm.prank(buyer);
        vm.expectRevert(TalosEscrow.DealExists.selector);
        escrow.lock(DEAL, seller, AMOUNT, uint64(block.timestamp + 10 minutes), evalRepro);
    }

    function test_Lock_RevertsOnPastDeadline() public {
        vm.warp(1000);
        vm.prank(buyer);
        vm.expectRevert(TalosEscrow.BadDeadline.selector);
        escrow.lock(DEAL, seller, AMOUNT, uint64(500), evalRepro);
    }

    function test_Lock_RevertsOnZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(TalosEscrow.ZeroAmount.selector);
        escrow.lock(DEAL, seller, 0, uint64(block.timestamp + 10 minutes), evalRepro);
    }

    function test_Lock_RevertsOnUnknownEval() public {
        vm.prank(buyer);
        vm.expectRevert(TalosEscrow.UnknownEval.selector);
        escrow.lock(DEAL, seller, AMOUNT, uint64(block.timestamp + 10 minutes), keccak256("nope"));
    }

    // --- settle: pass (score >= threshold) releases to seller ---

    function test_Settle_PassReleasesToSeller() public {
        _lock(evalRepro);
        bytes32 attId = _attest(evalRepro, 10_000);
        vm.prank(settler);
        escrow.settle(DEAL, attId);
        assertEq(usdc.balanceOf(seller), AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        (,,,,, TalosEscrow.Status status) = escrow.getDeal(DEAL);
        assertEq(uint256(status), uint256(TalosEscrow.Status.Released));
    }

    // --- settle: graded pass (97% over a 95% bar) releases ---

    function test_Settle_GradedPassReleases() public {
        _lock(evalField);
        bytes32 attId = _attest(evalField, 9700); // >= 9500
        vm.prank(settler);
        escrow.settle(DEAL, attId);
        assertEq(usdc.balanceOf(seller), AMOUNT);
    }

    // --- settle: graded fail (90% under a 95% bar) refunds — the eval-layer money shot ---

    function test_Settle_GradedFailRefunds() public {
        _lock(evalField);
        uint256 before = usdc.balanceOf(buyer);
        bytes32 attId = _attest(evalField, 9000); // < 9500
        vm.prank(settler);
        escrow.settle(DEAL, attId);
        assertEq(usdc.balanceOf(buyer), before + AMOUNT);
        assertEq(usdc.balanceOf(seller), 0);
        (,,,,, TalosEscrow.Status status) = escrow.getDeal(DEAL);
        assertEq(uint256(status), uint256(TalosEscrow.Status.Refunded));
    }

    // --- settle: fraud (reproduction scores 0) refunds ---

    function test_Settle_ZeroScoreRefunds() public {
        _lock(evalRepro);
        uint256 before = usdc.balanceOf(buyer);
        bytes32 attId = _attest(evalRepro, 0);
        vm.prank(settler);
        escrow.settle(DEAL, attId);
        assertEq(usdc.balanceOf(buyer), before + AMOUNT);
    }

    function test_Settle_OnlySettler() public {
        _lock(evalRepro);
        bytes32 attId = _attest(evalRepro, 10_000);
        vm.prank(stranger);
        vm.expectRevert(TalosEscrow.NotSettler.selector);
        escrow.settle(DEAL, attId);
    }

    function test_Settle_CannotDoubleSettle() public {
        _lock(evalRepro);
        bytes32 attId = _attest(evalRepro, 10_000);
        vm.prank(settler);
        escrow.settle(DEAL, attId);
        vm.prank(settler);
        vm.expectRevert(TalosEscrow.DealNotHeld.selector);
        escrow.settle(DEAL, attId);
    }

    function test_Settle_RevertsOnEvalMismatch() public {
        _lock(evalRepro);
        bytes32 attId = _attest(evalField, 10_000); // attestation for a DIFFERENT eval
        vm.prank(settler);
        vm.expectRevert(TalosEscrow.EvalMismatch.selector);
        escrow.settle(DEAL, attId);
    }

    function test_Settle_RevertsOnUnknownAttestation() public {
        _lock(evalRepro);
        vm.prank(settler);
        vm.expectRevert(AttestationRegistry.UnknownAttestation.selector);
        escrow.settle(DEAL, keccak256("ghost"));
    }

    // --- refund (permissionless deadline safety net) ---

    function test_Refund_AnyoneAfterDeadline() public {
        _lock(evalRepro);
        vm.warp(block.timestamp + 11 minutes);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(stranger); // permissionless safety net
        escrow.refund(DEAL);
        assertEq(usdc.balanceOf(buyer), before + AMOUNT);
    }

    function test_Refund_StrangerBeforeDeadline_Reverts() public {
        _lock(evalRepro);
        vm.prank(stranger);
        vm.expectRevert(TalosEscrow.NotSettlerNorExpired.selector);
        escrow.refund(DEAL);
    }

    function test_Refund_CannotDoubleSettle() public {
        _lock(evalRepro);
        vm.prank(settler);
        escrow.refund(DEAL);
        vm.warp(block.timestamp + 11 minutes);
        vm.prank(stranger);
        vm.expectRevert(TalosEscrow.DealNotHeld.selector);
        escrow.refund(DEAL);
    }

    function test_Settle_CannotAfterRefund() public {
        _lock(evalRepro);
        vm.prank(settler);
        escrow.refund(DEAL);
        bytes32 attId = _attest(evalRepro, 10_000);
        vm.prank(settler);
        vm.expectRevert(TalosEscrow.DealNotHeld.selector);
        escrow.settle(DEAL, attId);
    }

    // --- isExpired predicate (autonomous refund workflow branch) ---

    function test_IsExpired_FalseWhenHeldBeforeDeadline() public {
        _lock(evalRepro);
        assertFalse(escrow.isExpired(DEAL));
    }

    function test_IsExpired_TrueWhenHeldPastDeadline() public {
        _lock(evalRepro);
        vm.warp(block.timestamp + 11 minutes);
        assertTrue(escrow.isExpired(DEAL));
    }

    function test_IsExpired_FalseAfterSettled() public {
        _lock(evalRepro);
        vm.warp(block.timestamp + 11 minutes);
        vm.prank(stranger);
        escrow.refund(DEAL);
        assertFalse(escrow.isExpired(DEAL));
    }

    // --- settler rotation ---

    function test_SetSettler_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(TalosEscrow.NotOwner.selector);
        escrow.setSettler(stranger);
    }

    function test_SetSettler_Works() public {
        escrow.setSettler(address(0xABCD)); // test contract is owner
        assertEq(escrow.settler(), address(0xABCD));
    }

    // --- fuzz: conservation of funds on a passing settle ---

    function testFuzz_Settle_ConservesFunds(uint96 amount, uint64 dt, uint16 score) public {
        amount = uint96(bound(amount, 1, 1_000_000_000));
        dt = uint64(bound(dt, 1, 365 days));
        score = uint16(bound(score, 9500, 10_000)); // passing range for evalField
        bytes32 id = keccak256(abi.encode(amount, dt, score));
        vm.prank(buyer);
        escrow.lock(id, seller, amount, uint64(block.timestamp + dt), evalField);
        vm.prank(evaluator);
        bytes32 attId = attReg.attest(evalField, 1, id, keccak256("in"), score, bytes32(0));
        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(settler);
        escrow.settle(id, attId);
        assertEq(usdc.balanceOf(seller), sellerBefore + amount);
    }
}
