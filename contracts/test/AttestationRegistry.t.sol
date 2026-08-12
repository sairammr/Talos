// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EvalRegistry} from "../src/EvalRegistry.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

contract AttestationRegistryTest is Test {
    EvalRegistry evalReg;
    AttestationRegistry attReg;
    address evaluator = address(0xE7A1);
    bytes32 evalId;

    function setUp() public {
        evalReg = new EvalRegistry();
        attReg = new AttestationRegistry(evalReg);
        evalId = evalReg.register("reproduction", 1, keccak256("code"), EvalRegistry.TrustTier.Reproducible, 9500, bytes32(0));
    }

    function _attest(uint16 score) internal returns (bytes32) {
        vm.prank(evaluator);
        return attReg.attest(evalId, 1, keccak256("delivery"), keccak256("input"), score, keccak256("evidence"));
    }

    function test_Attest_StoresVerdict() public {
        bytes32 attId = _attest(9700);
        assertTrue(attReg.attestationExists(attId));
        AttestationRegistry.Attestation memory a = attReg.getAttestation(attId);
        assertEq(a.evalId, evalId);
        assertEq(a.score, 9700);
        assertEq(a.evaluator, evaluator);
        assertEq(a.deliverableHash, keccak256("delivery"));
        assertEq(a.inputHash, keccak256("input"));
        assertEq(a.evidenceHash, keccak256("evidence"));
    }

    function test_Attest_RevertsOnUnknownEval() public {
        vm.prank(evaluator);
        vm.expectRevert(AttestationRegistry.UnknownEval.selector);
        attReg.attest(keccak256("nope"), 1, bytes32(0), bytes32(0), 100, bytes32(0));
    }

    function test_Attest_RevertsOnBadScore() public {
        vm.prank(evaluator);
        vm.expectRevert(AttestationRegistry.BadScore.selector);
        attReg.attest(evalId, 1, bytes32(0), bytes32(0), 10_001, bytes32(0));
    }

    function test_Attest_UniqueIdsForRepeats() public {
        bytes32 a1 = _attest(9700);
        bytes32 a2 = _attest(9700); // same payload, different attId via counter
        assertTrue(a1 != a2);
        assertEq(attReg.count(), 2);
    }

    function test_Attest_EmitsAttested() public {
        vm.expectEmit(false, true, true, false);
        emit AttestationRegistry.Attested(bytes32(0), evaluator, evalId, keccak256("delivery"), 9700);
        _attest(9700);
    }

    function test_GetAttestation_RevertsOnUnknown() public {
        vm.expectRevert(AttestationRegistry.UnknownAttestation.selector);
        attReg.getAttestation(keccak256("ghost"));
    }
}
