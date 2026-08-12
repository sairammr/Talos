// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TalosEscrow} from "../src/TalosEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

contract TalosEscrowTest is Test {
    TalosEscrow escrow;
    MockUSDC usdc;

    address settler = address(0x5E77);
    address buyer = address(0xB0B);
    address seller = address(0x5E11);
    address stranger = address(0xDEAD);

    uint256 constant AMOUNT = 10_000_000; // 10 USDC (6 decimals)
    bytes32 constant DEAL = keccak256("deal-1");

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new TalosEscrow(IERC20(address(usdc)), settler);
        usdc.mint(buyer, 1_000_000_000);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _lock() internal {
        vm.prank(buyer);
        escrow.lock(DEAL, seller, AMOUNT, uint64(block.timestamp + 10 minutes));
    }

    // --- lock ---

    function test_Lock_HoldsFunds() public {
        _lock();
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        (, , , , TalosEscrow.Status status) = escrow.getDeal(DEAL);
        assertEq(uint256(status), uint256(TalosEscrow.Status.Held));
    }

    function test_Lock_RevertsOnDuplicate() public {
        _lock();
        vm.prank(buyer);
        vm.expectRevert(TalosEscrow.DealExists.selector);
        escrow.lock(DEAL, seller, AMOUNT, uint64(block.timestamp + 10 minutes));
    }

    function test_Lock_RevertsOnPastDeadline() public {
        vm.warp(1000);
        vm.prank(buyer);
        vm.expectRevert(TalosEscrow.BadDeadline.selector);
        escrow.lock(DEAL, seller, AMOUNT, uint64(500));
    }

    function test_Lock_RevertsOnZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(TalosEscrow.ZeroAmount.selector);
        escrow.lock(DEAL, seller, 0, uint64(block.timestamp + 10 minutes));
    }

    // --- release ---

    function test_Release_PaysSeller() public {
        _lock();
        vm.prank(settler);
        escrow.release(DEAL);
        assertEq(usdc.balanceOf(seller), AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Release_OnlySettler() public {
        _lock();
        vm.prank(stranger);
        vm.expectRevert(TalosEscrow.NotSettler.selector);
        escrow.release(DEAL);
    }

    function test_Release_CannotDoubleSettle() public {
        _lock();
        vm.prank(settler);
        escrow.release(DEAL);
        vm.prank(settler);
        vm.expectRevert(TalosEscrow.DealNotHeld.selector);
        escrow.release(DEAL);
    }

    function test_Release_CannotRefundAfterRelease() public {
        _lock();
        vm.prank(settler);
        escrow.release(DEAL);
        vm.prank(settler);
        vm.expectRevert(TalosEscrow.DealNotHeld.selector);
        escrow.refund(DEAL);
    }

    // --- refund ---

    function test_Refund_BySettler_ReturnsToBuyer() public {
        _lock();
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(settler);
        escrow.refund(DEAL);
        assertEq(usdc.balanceOf(buyer), before + AMOUNT);
    }

    function test_Refund_StrangerBeforeDeadline_Reverts() public {
        _lock();
        vm.prank(stranger);
        vm.expectRevert(TalosEscrow.NotSettlerNorExpired.selector);
        escrow.refund(DEAL);
    }

    function test_Refund_AnyoneAfterDeadline() public {
        _lock();
        vm.warp(block.timestamp + 11 minutes);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(stranger); // permissionless safety net
        escrow.refund(DEAL);
        assertEq(usdc.balanceOf(buyer), before + AMOUNT);
    }

    function test_Refund_CannotDoubleSettle() public {
        _lock();
        vm.prank(settler);
        escrow.refund(DEAL);
        vm.warp(block.timestamp + 11 minutes);
        vm.prank(stranger);
        vm.expectRevert(TalosEscrow.DealNotHeld.selector);
        escrow.refund(DEAL);
    }

    // --- isExpired predicate (autonomous refund workflow branch) ---

    function test_IsExpired_FalseWhenHeldBeforeDeadline() public {
        _lock();
        assertFalse(escrow.isExpired(DEAL));
    }

    function test_IsExpired_TrueWhenHeldPastDeadline() public {
        _lock();
        vm.warp(block.timestamp + 11 minutes);
        assertTrue(escrow.isExpired(DEAL));
    }

    function test_IsExpired_FalseAfterSettled() public {
        _lock();
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

    // --- fuzz: conservation of funds ---

    function testFuzz_Release_ConservesFunds(uint96 amount, uint64 dt) public {
        amount = uint96(bound(amount, 1, 1_000_000_000));
        dt = uint64(bound(dt, 1, 365 days));
        bytes32 id = keccak256(abi.encode(amount, dt));
        vm.prank(buyer);
        escrow.lock(id, seller, amount, uint64(block.timestamp + dt));
        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(settler);
        escrow.release(id);
        assertEq(usdc.balanceOf(seller), sellerBefore + amount);
    }
}
