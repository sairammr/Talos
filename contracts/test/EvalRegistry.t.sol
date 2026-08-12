// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EvalRegistry} from "../src/EvalRegistry.sol";

contract EvalRegistryTest is Test {
    EvalRegistry reg;
    address author = address(0xA47);

    function setUp() public {
        reg = new EvalRegistry();
    }

    function _register(uint16 threshold) internal returns (bytes32) {
        vm.prank(author);
        return reg.register("reproduction", 1, keccak256("code"), EvalRegistry.TrustTier.Reproducible, threshold, bytes32(0));
    }

    function test_Register_StoresEval() public {
        bytes32 id = _register(10_000);
        assertEq(id, keccak256(abi.encode("reproduction", uint16(1))));
        assertTrue(reg.exists(id));
        EvalRegistry.Eval memory e = reg.getEval(id);
        assertEq(e.threshold, 10_000);
        assertEq(e.author, author);
        assertEq(e.evaluatorCodeHash, keccak256("code"));
        assertEq(uint256(e.trustTier), uint256(EvalRegistry.TrustTier.Reproducible));
    }

    function test_Register_RevertsOnDuplicate() public {
        _register(10_000);
        vm.prank(author);
        vm.expectRevert(EvalRegistry.EvalExists.selector);
        reg.register("reproduction", 1, keccak256("code"), EvalRegistry.TrustTier.Reproducible, 10_000, bytes32(0));
    }

    function test_Register_NewVersionIsNewEntry() public {
        bytes32 id1 = _register(10_000);
        vm.prank(author);
        bytes32 id2 =
            reg.register("reproduction", 2, keccak256("code2"), EvalRegistry.TrustTier.Reproducible, 9000, bytes32(0));
        assertTrue(id1 != id2);
        assertTrue(reg.exists(id2));
    }

    function test_Register_RevertsOnBadThreshold() public {
        vm.prank(author);
        vm.expectRevert(EvalRegistry.BadThreshold.selector);
        reg.register("x", 1, bytes32(0), EvalRegistry.TrustTier.Reproducible, 10_001, bytes32(0));
    }

    function test_Register_RejectsNonReproducibleTier() public {
        vm.prank(author);
        vm.expectRevert(EvalRegistry.UnsupportedTier.selector);
        reg.register("x", 1, bytes32(0), EvalRegistry.TrustTier.Judged, 9000, bytes32(0));
    }

    function test_ThresholdOf_RevertsOnUnknown() public {
        vm.expectRevert(EvalRegistry.UnknownEval.selector);
        reg.thresholdOf(keccak256("nope"));
    }

    function test_GetEval_RevertsOnUnknown() public {
        vm.expectRevert(EvalRegistry.UnknownEval.selector);
        reg.getEval(keccak256("nope"));
    }
}
