// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC usdc;
    uint256 buyerPk = 0xA11CE;
    address buyer;
    address seller = address(0x5E11);

    function setUp() public {
        usdc = new MockUSDC();
        buyer = vm.addr(buyerPk);
        usdc.mint(buyer, 1_000_000);
    }

    function _sign(uint256 value, bytes32 nonce, uint256 validBefore)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(
            abi.encode(usdc.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), buyer, seller, value, uint256(0), validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(buyerPk, digest);
    }

    function test_TransferWithAuthorization_Moves() public {
        bytes32 nonce = keccak256("x402-1");
        uint256 vb = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _sign(100_000, nonce, vb);
        usdc.transferWithAuthorization(buyer, seller, 100_000, 0, vb, nonce, v, r, s);
        assertEq(usdc.balanceOf(seller), 100_000);
        assertTrue(usdc.authorizationState(buyer, nonce));
    }

    function test_TransferWithAuthorization_ReplayReverts() public {
        bytes32 nonce = keccak256("x402-2");
        uint256 vb = block.timestamp + 300;
        (uint8 v, bytes32 r, bytes32 s) = _sign(100_000, nonce, vb);
        usdc.transferWithAuthorization(buyer, seller, 100_000, 0, vb, nonce, v, r, s);
        vm.expectRevert(MockUSDC.AuthUsed.selector);
        usdc.transferWithAuthorization(buyer, seller, 100_000, 0, vb, nonce, v, r, s);
    }

    function test_TransferWithAuthorization_BadSignerReverts() public {
        bytes32 nonce = keccak256("x402-3");
        uint256 vb = block.timestamp + 300;
        bytes32 structHash = keccak256(
            abi.encode(usdc.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), buyer, seller, uint256(100_000), uint256(0), vb, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest); // wrong key
        vm.expectRevert(MockUSDC.AuthBadSigner.selector);
        usdc.transferWithAuthorization(buyer, seller, 100_000, 0, vb, nonce, v, r, s);
    }

    function test_TransferWithAuthorization_ExpiredReverts() public {
        bytes32 nonce = keccak256("x402-4");
        uint256 vb = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) = _sign(100_000, nonce, vb);
        vm.warp(vb + 1);
        vm.expectRevert(MockUSDC.AuthExpired.selector);
        usdc.transferWithAuthorization(buyer, seller, 100_000, 0, vb, nonce, v, r, s);
    }
}
