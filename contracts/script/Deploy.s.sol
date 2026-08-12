// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TalosEscrow} from "../src/TalosEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";

/// @notice Deploys MockUSDC (if USDC_ADDRESS unset) + TalosEscrow.
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

        TalosEscrow escrow = new TalosEscrow(IERC20(usdcAddr), settler);
        console2.log("TalosEscrow:", address(escrow));
        console2.log("USDC:", usdcAddr);
        console2.log("Settler:", settler);

        vm.stopBroadcast();
    }
}
