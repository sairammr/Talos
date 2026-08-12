// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TalosEscrow} from "../src/TalosEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {EvalRegistry} from "../src/EvalRegistry.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

/// @notice Deploys the eval-layer stack: EvalRegistry + AttestationRegistry + TalosEscrow
///         (a consumer of attested verdicts) + MockUSDC (if USDC_ADDRESS unset).
///         The keeper registers evals and posts attestations at runtime.
/// Env:
///   PRIVATE_KEY   deployer key
///   SETTLER       settler address (KeeperHub signer). Defaults to deployer.
///   USDC_ADDRESS  existing USDC (Base Sepolia). If unset, deploys MockUSDC.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address settler = vm.envOr("SETTLER", deployer);
        address usdcAddr = vm.envOr("USDC_ADDRESS", address(0));

        vm.startBroadcast(pk);

        if (usdcAddr == address(0)) {
            MockUSDC mock = new MockUSDC();
            mock.mint(deployer, 1_000_000_000_000); // 1,000,000 USDC to deployer
            usdcAddr = address(mock);
            console2.log("MockUSDC:", usdcAddr);
        }

        EvalRegistry evalRegistry = new EvalRegistry();
        AttestationRegistry attestationRegistry = new AttestationRegistry(evalRegistry);
        TalosEscrow escrow = new TalosEscrow(IERC20(usdcAddr), settler, evalRegistry, attestationRegistry);

        console2.log("EvalRegistry:", address(evalRegistry));
        console2.log("AttestationRegistry:", address(attestationRegistry));
        console2.log("TalosEscrow:", address(escrow));
        console2.log("USDC:", usdcAddr);
        console2.log("Settler:", settler);

        vm.stopBroadcast();
    }
}
